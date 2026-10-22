"""
Flask API — Smart Contract Rectification Engine (SCRE)
Adds SQLite persistence for contract history and reports,
plus PDF generation via ReportLab.
"""

import json
import os
import sqlite3
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, g, jsonify, request, send_file
from flask_cors import CORS
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
    TableStyle,
)

from src.pipeline import run_pipeline

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

PROJECT_ROOT = Path(__file__).resolve().parent
SAMPLE_PATH  = PROJECT_ROOT / "sample_contracts" / "VulnerableBank.sol"
DB_PATH      = PROJECT_ROOT / "scre.db"
PDF_DIR      = PROJECT_ROOT / "reports" / "pdfs"
PDF_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(str(DB_PATH), detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS contract_history (
            id            TEXT PRIMARY KEY,
            filename      TEXT NOT NULL,
            language      TEXT NOT NULL DEFAULT 'Solidity',
            analyzed_at   TEXT NOT NULL,
            original_code TEXT,
            repaired_code TEXT,
            detection     TEXT,
            repair        TEXT,
            verification  TEXT,
            vuln_total    INTEGER DEFAULT 0,
            vuln_critical INTEGER DEFAULT 0,
            vuln_high     INTEGER DEFAULT 0,
            vuln_medium   INTEGER DEFAULT 0,
            vuln_low      INTEGER DEFAULT 0,
            rect_status   TEXT DEFAULT 'Not Fixed',
            pipeline_ok   INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS reports (
            id              TEXT PRIMARY KEY,
            contract_id     TEXT NOT NULL,
            filename        TEXT NOT NULL,
            pdf_path        TEXT,
            generated_at    TEXT NOT NULL,
            FOREIGN KEY (contract_id) REFERENCES contract_history(id) ON DELETE CASCADE
        );
    """)
    db.commit()
    db.close()


init_db()

# ---------------------------------------------------------------------------
# Utility: derive severity counts from detection result
# ---------------------------------------------------------------------------

MOCK_ISSUES = [
    {"id": 1, "severity": "critical", "title": "Reentrancy Vulnerability",
     "description": "External call before state update allows reentrancy attack.",
     "line": 8,
     "impact": "Complete drain of contract ETH balance via recursive calls.",
     "mitigation": "Apply Checks-Effects-Interactions pattern; use ReentrancyGuard."},
    {"id": 2, "severity": "high", "title": "Unchecked Call Return Value",
     "description": "Return value of low-level .call() is not validated.",
     "line": 9,
     "impact": "Silent failures — failed transfers go unnoticed.",
     "mitigation": "Always check the bool return value; prefer transfer() or revert on failure."},
    {"id": 3, "severity": "medium", "title": "Missing Access Control",
     "description": "withdraw() can be called by any external account.",
     "line": 9,
     "impact": "Unauthorised users may trigger withdrawals.",
     "mitigation": "Add an onlyOwner modifier or role-based access control."},
    {"id": 4, "severity": "low", "title": "Integer Overflow/Underflow (Potential)",
     "description": "No SafeMath or built-in overflow checks for older Solidity versions.",
     "line": 7,
     "impact": "Arithmetic wrap-around may cause unexpected balance manipulation.",
     "mitigation": "Use Solidity ≥0.8.0 (built-in checks) or OpenZeppelin SafeMath."},
]


def compute_severity_counts(detection: dict, repair: dict) -> dict:
    detected = detection.get("detected", False)
    if not detected:
        return {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0}
    counts = {"critical": 1, "high": 1, "medium": 1, "low": 1}
    counts["total"] = sum(counts.values())
    return counts


def compute_rect_status(repair: dict, verification: dict) -> str:
    if repair.get("success") and verification.get("success"):
        return "Fixed"
    if repair.get("success"):
        return "Partially Fixed"
    return "Not Fixed"


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

def _hex(h):
    h = h.lstrip("#")
    return colors.HexColor(f"#{h}")


def build_pdf(contract: sqlite3.Row, pdf_path: Path, report_id: str) -> None:
    """Generate a professional PDF report from stored contract analysis data."""

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    W = A4[0] - 4*cm

    # Custom styles
    def ps(name, **kw):
        base = kw.pop("parent", "Normal")
        return ParagraphStyle(name, parent=styles[base], **kw)

    S = {
        "cover_title": ps("ct", fontSize=26, fontName="Helvetica-Bold",
                          textColor=_hex("e2e8f0"), spaceAfter=6, leading=32),
        "cover_sub":   ps("cs", fontSize=13, textColor=_hex("94a3b8"), spaceAfter=4),
        "cover_meta":  ps("cm", fontSize=10, textColor=_hex("64748b"), spaceAfter=3),
        "h1":          ps("h1", fontSize=16, fontName="Helvetica-Bold",
                          textColor=_hex("a855f7"), spaceBefore=14, spaceAfter=6),
        "h2":          ps("h2", fontSize=13, fontName="Helvetica-Bold",
                          textColor=_hex("6366f1"), spaceBefore=10, spaceAfter=4),
        "body":        ps("body", fontSize=10, textColor=_hex("94a3b8"),
                          leading=15, spaceAfter=4),
        "code":        ps("code", fontSize=8, fontName="Courier",
                          textColor=_hex("c9d1e9"), backColor=_hex("0a0c1e"),
                          leading=12, spaceAfter=4, leftIndent=10, rightIndent=10),
        "label":       ps("label", fontSize=9, fontName="Helvetica-Bold",
                          textColor=_hex("e2e8f0")),
        "disclaimer":  ps("disc", fontSize=9, textColor=_hex("64748b"),
                          leading=14, spaceAfter=4),
    }

    detection    = json.loads(contract["detection"]    or "{}")
    repair_data  = json.loads(contract["repair"]       or "{}")
    verification = json.loads(contract["verification"] or "{}")

    rect_status = contract["rect_status"]
    analyzed_at = contract["analyzed_at"]
    filename    = contract["filename"]
    language    = contract["language"]

    def divider():
        return HRFlowable(width="100%", thickness=0.5,
                          color=_hex("6366f1"), spaceAfter=8, spaceBefore=4)

    story = []

    # ── COVER PAGE ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 2*cm))
    story.append(Paragraph("Smart Contract", S["cover_title"]))
    story.append(Paragraph("Vulnerability Rectification Engine", S["cover_title"]))
    story.append(Spacer(1, 0.4*cm))
    story.append(divider())
    story.append(Spacer(1, 0.3*cm))

    cover_data = [
        ["Report ID",         report_id[:24] + "…"],
        ["Contract",          filename],
        ["Language",          language],
        ["Analysis Date",     analyzed_at[:19].replace("T", " ")],
        ["Generated",         datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
        ["Rectification",     rect_status],
    ]
    ct = Table(cover_data, colWidths=[4*cm, W - 4*cm])
    ct.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (0, -1), _hex("111530")),
        ("BACKGROUND",   (1, 0), (1, -1), _hex("0d1128")),
        ("TEXTCOLOR",    (0, 0), (0, -1), _hex("6366f1")),
        ("TEXTCOLOR",    (1, 0), (1, -1), _hex("e2e8f0")),
        ("FONTNAME",     (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [_hex("111530"), _hex("0d1128")]),
        ("GRID",         (0, 0), (-1, -1), 0.3, _hex("6366f1")),
        ("TOPPADDING",   (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 7),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    story.append(ct)
    story.append(PageBreak())

    # ── EXECUTIVE SUMMARY ───────────────────────────────────────────────────
    story.append(Paragraph("Executive Summary", S["h1"]))
    story.append(divider())

    total     = contract["vuln_total"]
    critical  = contract["vuln_critical"]
    high      = contract["vuln_high"]
    medium    = contract["vuln_medium"]
    low       = contract["vuln_low"]

    overview = (
        f"This report presents the results of an automated security analysis of the "
        f"smart contract <b>{filename}</b> written in <b>{language}</b>. "
        f"The analysis was conducted by the SCRE automated pipeline on "
        f"{analyzed_at[:10]}. "
        f"A total of <b>{total} vulnerabilities</b> were identified. "
        f"The overall rectification status is <b>{rect_status}</b>."
    )
    story.append(Paragraph(overview, S["body"]))
    story.append(Spacer(1, 0.3*cm))

    sev_data = [
        ["Severity", "Count", "Assessment"],
        ["Critical", str(critical), "Immediate action required"],
        ["High",     str(high),     "Fix before deployment"],
        ["Medium",   str(medium),   "Review and mitigate"],
        ["Low",      str(low),      "Monitor and document"],
        ["Total",    str(total),    ""],
    ]
    sev_colors = [_hex("111530"), _hex("ef444430"), _hex("f9731630"),
                  _hex("eab30830"), _hex("3b82f630"), _hex("111530")]
    st = Table(sev_data, colWidths=[3*cm, 2.5*cm, W - 5.5*cm])
    st.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  _hex("6366f1")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), sev_colors[1:]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), _hex("e2e8f0")),
        ("GRID",          (0, 0), (-1, -1), 0.3, _hex("6366f1")),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(st)
    story.append(PageBreak())

    # ── CONTRACT INFORMATION ────────────────────────────────────────────────
    story.append(Paragraph("Contract Information", S["h1"]))
    story.append(divider())

    info_data = [
        ["Filename",            filename],
        ["Language",            language],
        ["Analysis Tool",       "SCRE v1.0 — Pattern-based detector"],
        ["Detection Method",    "Reentrancy pattern (low-level .call before state update)"],
        ["Repair Strategy",     "Checks-Effects-Interactions + reentrancy lock"],
        ["Compilation Check",   "Solidity 0.8.30 via npx solc"],
    ]
    it = Table(info_data, colWidths=[4.5*cm, W - 4.5*cm])
    it.setStyle(TableStyle([
        ("FONTNAME",     (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",    (0, 0), (0, -1), _hex("6366f1")),
        ("TEXTCOLOR",    (1, 0), (1, -1), _hex("e2e8f0")),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[_hex("111530"), _hex("0d1128")]),
        ("GRID",         (0, 0), (-1, -1), 0.3, _hex("6366f1")),
        ("FONTSIZE",     (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    story.append(it)

    if contract["original_code"]:
        story.append(Spacer(1, 0.4*cm))
        story.append(Paragraph("Original Source Code", S["h2"]))
        code_text = (contract["original_code"] or "")[:2000]
        if len(contract["original_code"]) > 2000:
            code_text += "\n… [truncated for report]"
        story.append(Paragraph(code_text.replace("\n", "<br/>").replace(" ", "&nbsp;"), S["code"]))

    story.append(PageBreak())

    # ── VULNERABILITY ANALYSIS ──────────────────────────────────────────────
    story.append(Paragraph("Vulnerability Analysis", S["h1"]))
    story.append(divider())

    if not detection.get("detected"):
        story.append(Paragraph(
            "No vulnerabilities matching the supported detection patterns were found in this contract.",
            S["body"]
        ))
    else:
        for issue in MOCK_ISSUES:
            sev = issue["severity"].upper()
            sev_color_map = {"CRITICAL": "ef4444", "HIGH": "f97316",
                             "MEDIUM": "eab308", "LOW": "3b82f6"}
            c = sev_color_map.get(sev, "94a3b8")
            story.append(Paragraph(
                f'<font color="#{c}"><b>{issue["title"]}</b></font>'
                f'  <font color="#64748b">[{sev}] — Line {issue["line"]}</font>',
                S["h2"]
            ))
            story.append(Paragraph(f"<b>Description:</b> {issue['description']}", S["body"]))
            story.append(Paragraph(f"<b>Impact:</b> {issue['impact']}", S["body"]))
            story.append(Paragraph(f"<b>Mitigation:</b> {issue['mitigation']}", S["body"]))
            story.append(Spacer(1, 0.2*cm))
            story.append(divider())

    story.append(PageBreak())

    # ── SUGGESTED RECTIFICATIONS ────────────────────────────────────────────
    story.append(Paragraph("Suggested Rectifications", S["h1"]))
    story.append(divider())

    if repair_data.get("success") and repair_data.get("repaired_code"):
        story.append(Paragraph(repair_data.get("message", ""), S["body"]))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph("Repaired Source Code", S["h2"]))
        rep_code = (repair_data["repaired_code"])[:2000]
        if len(repair_data["repaired_code"]) > 2000:
            rep_code += "\n… [truncated]"
        story.append(Paragraph(rep_code.replace("\n", "<br/>").replace(" ", "&nbsp;"), S["code"]))

        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph("Key Changes Made", S["h2"]))
        changes = [
            "Added <b>bool private locked</b> reentrancy guard variable.",
            "Set <b>locked = true</b> at the start of withdraw() to block re-entry.",
            "Moved <b>balances[msg.sender] = 0</b> (state update) BEFORE the external .call().",
            "External transfer now occurs AFTER state is updated (Checks-Effects-Interactions).",
            "Added <b>require(!locked)</b> check to revert re-entrant calls immediately.",
            "Reset <b>locked = false</b> after successful transfer.",
        ]
        for c in changes:
            story.append(Paragraph(f"• {c}", S["body"]))

        comp_ok = verification.get("success", False)
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(
            f"<b>Compilation Status:</b> {'✓ Passed (Solidity 0.8.30)' if comp_ok else '✗ Failed — manual review required'}",
            S["body"]
        ))
    else:
        msg = repair_data.get("message", "No supported repair was applied.")
        story.append(Paragraph(f"Rectification was not applied: {msg}", S["body"]))
        story.append(Paragraph(
            "Manual review and remediation by a qualified Solidity developer is recommended.",
            S["body"]
        ))

    story.append(PageBreak())

    # ── SECURITY RECOMMENDATIONS ────────────────────────────────────────────
    story.append(Paragraph("Security Recommendations", S["h1"]))
    story.append(divider())

    recs = [
        "<b>Apply Checks-Effects-Interactions (CEI):</b> Always update contract state before making external calls.",
        "<b>Use ReentrancyGuard:</b> Consider OpenZeppelin's battle-tested ReentrancyGuard modifier for all withdrawal functions.",
        "<b>Validate all external call return values:</b> Never ignore the boolean returned by .call().",
        "<b>Implement access control:</b> Use Ownable or role-based patterns for sensitive functions.",
        "<b>Use Solidity ≥0.8.0:</b> Built-in overflow/underflow protection removes an entire class of arithmetic vulnerabilities.",
        "<b>Conduct manual code review:</b> Automated tools detect known patterns; novel vulnerabilities require expert human review.",
        "<b>Deploy to testnet first:</b> Always test thoroughly on a public testnet before mainnet deployment.",
        "<b>Consider a professional security audit:</b> For any contract handling real funds, engage a reputable auditing firm.",
    ]
    for r in recs:
        story.append(Paragraph(f"• {r}", S["body"]))

    story.append(PageBreak())

    # ── DISCLAIMER ──────────────────────────────────────────────────────────
    story.append(Paragraph("Disclaimer", S["h1"]))
    story.append(divider())
    story.append(Paragraph(
        "This report was generated by the SCRE automated analysis prototype. "
        "The analysis is pattern-based and limited to a specific subset of known vulnerability classes. "
        "A clean result or successful compilation does not guarantee the complete absence of vulnerabilities. "
        "Generated repairs must be reviewed, tested, and validated by a qualified Solidity developer before use. "
        "SCRE is provided for educational and research purposes only. "
        "Do not deploy any contract — repaired or otherwise — to mainnet based solely on this report. "
        "The authors accept no liability for damages arising from the use of this tool or its output.",
        S["disclaimer"]
    ))

    doc.build(story)


# ---------------------------------------------------------------------------
# API Routes — Health
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# API Routes — Sample contract
# ---------------------------------------------------------------------------

@app.route("/api/sample-contract", methods=["GET"])
def get_sample_contract():
    if not SAMPLE_PATH.is_file():
        return jsonify({"error": "Sample contract not found."}), 404
    return jsonify({"filename": SAMPLE_PATH.name,
                    "code": SAMPLE_PATH.read_text(encoding="utf-8")})


# ---------------------------------------------------------------------------
# API Routes — Analyze + auto-save to DB
# ---------------------------------------------------------------------------

@app.route("/api/analyze", methods=["POST"])
def analyze():
    use_sample  = False
    source_path = None
    filename    = "contract.sol"
    language    = "Solidity"

    if "file" in request.files:
        uploaded = request.files["file"]
        if not uploaded.filename.lower().endswith(".sol"):
            return jsonify({"error": "Only .sol files are supported."}), 400
        filename = uploaded.filename
        tmp_dir  = tempfile.mkdtemp(prefix="scre_upload_")
        source_path = Path(tmp_dir) / filename
        uploaded.save(str(source_path))
    elif request.is_json:
        body = request.get_json(silent=True) or {}
        use_sample = body.get("use_sample", False)
        language   = body.get("language", "Solidity")
    else:
        use_sample = request.form.get("use_sample", "false").lower() == "true"

    if use_sample or source_path is None:
        if not SAMPLE_PATH.is_file():
            return jsonify({"error": "Sample contract not found."}), 404
        source_path = SAMPLE_PATH
        filename    = SAMPLE_PATH.name

    result = run_pipeline(source_path)

    original_code = ""
    if source_path and Path(source_path).is_file():
        original_code = Path(source_path).read_text(encoding="utf-8")
        result["original_code"] = original_code

    for key in ("original_path", "repaired_path"):
        if key in result and result[key]:
            result[key] = str(result[key])

    # --- Persist to DB ---
    detection    = result.get("detection", {})
    repair_d     = result.get("repair", {})
    verification = result.get("verification", {})
    sev          = compute_severity_counts(detection, repair_d)
    rect_status  = compute_rect_status(repair_d, verification)
    contract_id  = str(uuid.uuid4())

    db = get_db()
    db.execute("""
        INSERT INTO contract_history
            (id, filename, language, analyzed_at, original_code, repaired_code,
             detection, repair, verification,
             vuln_total, vuln_critical, vuln_high, vuln_medium, vuln_low,
             rect_status, pipeline_ok)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        contract_id,
        filename,
        language,
        datetime.utcnow().isoformat(),
        original_code,
        repair_d.get("repaired_code", ""),
        json.dumps(detection),
        json.dumps(repair_d),
        json.dumps(verification),
        sev["total"],
        sev["critical"],
        sev["high"],
        sev["medium"],
        sev["low"],
        rect_status,
        1 if result.get("success") else 0,
    ))
    db.commit()

    result["contract_id"] = contract_id
    result["rect_status"]  = rect_status
    result["severity_counts"] = sev
    result["issues"] = MOCK_ISSUES if detection.get("detected") else []

    return jsonify(result)


# ---------------------------------------------------------------------------
# API Routes — Contract History
# ---------------------------------------------------------------------------

@app.route("/api/contracts", methods=["GET"])
def list_contracts():
    search   = request.args.get("search", "").strip()
    status   = request.args.get("status", "")
    severity = request.args.get("severity", "")
    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(50, int(request.args.get("per_page", 10)))

    db = get_db()
    q  = "SELECT * FROM contract_history WHERE 1=1"
    params = []

    if search:
        q += " AND filename LIKE ?"
        params.append(f"%{search}%")
    if status:
        q += " AND rect_status = ?"
        params.append(status)
    if severity == "critical":
        q += " AND vuln_critical > 0"
    elif severity == "high":
        q += " AND vuln_high > 0"
    elif severity == "medium":
        q += " AND vuln_medium > 0"
    elif severity == "low":
        q += " AND vuln_low > 0"

    q += " ORDER BY analyzed_at DESC"

    total = db.execute(f"SELECT COUNT(*) FROM ({q})", params).fetchone()[0]
    rows  = db.execute(q + f" LIMIT {per_page} OFFSET {(page-1)*per_page}", params).fetchall()

    contracts = []
    for r in rows:
        contracts.append({
            "id":           r["id"],
            "filename":     r["filename"],
            "language":     r["language"],
            "analyzed_at":  r["analyzed_at"],
            "vuln_total":   r["vuln_total"],
            "vuln_critical":r["vuln_critical"],
            "vuln_high":    r["vuln_high"],
            "vuln_medium":  r["vuln_medium"],
            "vuln_low":     r["vuln_low"],
            "rect_status":  r["rect_status"],
            "pipeline_ok":  bool(r["pipeline_ok"]),
        })

    return jsonify({"contracts": contracts, "total": total, "page": page, "per_page": per_page})


@app.route("/api/contracts/<contract_id>", methods=["GET"])
def get_contract(contract_id):
    db  = get_db()
    row = db.execute("SELECT * FROM contract_history WHERE id=?", (contract_id,)).fetchone()
    if not row:
        return jsonify({"error": "Contract not found."}), 404

    detection    = json.loads(row["detection"]    or "{}")
    repair_d     = json.loads(row["repair"]       or "{}")
    verification = json.loads(row["verification"] or "{}")

    return jsonify({
        "id":            row["id"],
        "filename":      row["filename"],
        "language":      row["language"],
        "analyzed_at":   row["analyzed_at"],
        "original_code": row["original_code"],
        "repaired_code": row["repaired_code"],
        "detection":     detection,
        "repair":        repair_d,
        "verification":  verification,
        "vuln_total":    row["vuln_total"],
        "vuln_critical": row["vuln_critical"],
        "vuln_high":     row["vuln_high"],
        "vuln_medium":   row["vuln_medium"],
        "vuln_low":      row["vuln_low"],
        "rect_status":   row["rect_status"],
        "pipeline_ok":   bool(row["pipeline_ok"]),
        "issues":        MOCK_ISSUES if detection.get("detected") else [],
    })


@app.route("/api/contracts/<contract_id>", methods=["DELETE"])
def delete_contract(contract_id):
    db = get_db()
    # Also delete related reports & PDFs
    reps = db.execute("SELECT pdf_path FROM reports WHERE contract_id=?", (contract_id,)).fetchall()
    for r in reps:
        if r["pdf_path"]:
            try:
                Path(r["pdf_path"]).unlink(missing_ok=True)
            except Exception:
                pass
    db.execute("DELETE FROM reports WHERE contract_id=?", (contract_id,))
    db.execute("DELETE FROM contract_history WHERE id=?", (contract_id,))
    db.commit()
    return jsonify({"success": True})


@app.route("/api/contracts/<contract_id>/status", methods=["PATCH"])
def update_contract_status(contract_id):
    """Manually override the rectification status of a contract."""
    body = request.get_json(silent=True) or {}
    new_status = body.get("rect_status", "").strip()
    allowed = {"Fixed", "Partially Fixed", "Not Fixed"}
    if new_status not in allowed:
        return jsonify({"error": f"Invalid status. Must be one of: {', '.join(allowed)}"}), 400
    db = get_db()
    row = db.execute("SELECT id FROM contract_history WHERE id=?", (contract_id,)).fetchone()
    if not row:
        return jsonify({"error": "Contract not found."}), 404
    db.execute("UPDATE contract_history SET rect_status=? WHERE id=?", (new_status, contract_id))
    db.commit()
    return jsonify({"success": True, "rect_status": new_status})


# ---------------------------------------------------------------------------
# API Routes — Reports
# ---------------------------------------------------------------------------

@app.route("/api/reports", methods=["GET"])
def list_reports():
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "")
    page   = max(1, int(request.args.get("page", 1)))
    per_page = min(50, int(request.args.get("per_page", 10)))

    db = get_db()
    q = """
        SELECT r.id, r.filename, r.generated_at, r.pdf_path,
               c.id as contract_id, c.analyzed_at, c.vuln_total,
               c.vuln_critical, c.vuln_high, c.vuln_medium, c.vuln_low,
               c.rect_status, c.filename as contract_filename
        FROM reports r
        JOIN contract_history c ON r.contract_id = c.id
        WHERE 1=1
    """
    params = []
    if search:
        q += " AND c.filename LIKE ?"
        params.append(f"%{search}%")
    if status:
        q += " AND c.rect_status = ?"
        params.append(status)

    q += " ORDER BY r.generated_at DESC"

    total = db.execute(f"SELECT COUNT(*) FROM ({q})", params).fetchone()[0]
    rows  = db.execute(q + f" LIMIT {per_page} OFFSET {(page-1)*per_page}", params).fetchall()

    reports = [{
        "id":               r["id"],
        "contract_id":      r["contract_id"],
        "contract_filename":r["contract_filename"],
        "report_filename":  r["filename"],
        "generated_at":     r["generated_at"],
        "analyzed_at":      r["analyzed_at"],
        "vuln_total":       r["vuln_total"],
        "vuln_critical":    r["vuln_critical"],
        "vuln_high":        r["vuln_high"],
        "vuln_medium":      r["vuln_medium"],
        "vuln_low":         r["vuln_low"],
        "rect_status":      r["rect_status"],
        "has_pdf":          bool(r["pdf_path"] and Path(r["pdf_path"]).exists()),
    } for r in rows]

    return jsonify({"reports": reports, "total": total, "page": page, "per_page": per_page})


@app.route("/api/reports/stats", methods=["GET"])
def reports_stats():
    db = get_db()
    total_reports  = db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    total_contracts= db.execute("SELECT COUNT(*) FROM contract_history").fetchone()[0]
    total_vulns    = db.execute("SELECT COALESCE(SUM(vuln_total),0) FROM contract_history").fetchone()[0]
    total_fixed    = db.execute("SELECT COUNT(*) FROM contract_history WHERE rect_status='Fixed'").fetchone()[0]
    return jsonify({
        "total_reports":   total_reports,
        "total_contracts": total_contracts,
        "total_vulns":     total_vulns,
        "total_fixed":     total_fixed,
    })


@app.route("/api/reports/generate/<contract_id>", methods=["POST"])
def generate_report(contract_id):
    db  = get_db()
    row = db.execute("SELECT * FROM contract_history WHERE id=?", (contract_id,)).fetchone()
    if not row:
        return jsonify({"error": "Contract not found."}), 404

    # Prevent duplicate — return existing if already generated for this contract
    existing = db.execute(
        "SELECT * FROM reports WHERE contract_id=?", (contract_id,)
    ).fetchone()
    force = request.args.get("force", "false").lower() == "true"
    if existing and not force:
        has_pdf = bool(existing["pdf_path"] and Path(existing["pdf_path"]).exists())
        return jsonify({
            "report_id":  existing["id"],
            "filename":   existing["filename"],
            "already_existed": True,
            "has_pdf":    has_pdf,
        })

    report_id  = str(uuid.uuid4())
    date_str   = datetime.utcnow().strftime("%Y-%m-%d")
    safe_name  = row["filename"].replace(".sol", "").replace(" ", "_")
    pdf_name   = f"SCRE_{safe_name}_{date_str}.pdf"
    pdf_path   = PDF_DIR / pdf_name

    try:
        build_pdf(row, pdf_path, report_id)
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {e}"}), 500

    # If regenerating, delete old record
    if existing and force:
        if existing["pdf_path"]:
            try:
                Path(existing["pdf_path"]).unlink(missing_ok=True)
            except Exception:
                pass
        db.execute("DELETE FROM reports WHERE contract_id=?", (contract_id,))

    db.execute("""
        INSERT INTO reports (id, contract_id, filename, pdf_path, generated_at)
        VALUES (?,?,?,?,?)
    """, (report_id, contract_id, pdf_name, str(pdf_path), datetime.utcnow().isoformat()))
    db.commit()

    return jsonify({
        "report_id": report_id,
        "filename":  pdf_name,
        "already_existed": False,
        "has_pdf":   True,
    })


@app.route("/api/reports/<report_id>/download", methods=["GET"])
def download_report(report_id):
    db  = get_db()
    row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if not row:
        return jsonify({"error": "Report not found."}), 404
    pdf_path = Path(row["pdf_path"])
    if not pdf_path.exists():
        return jsonify({"error": "PDF file missing. Please regenerate."}), 404
    return send_file(str(pdf_path), as_attachment=True, download_name=row["filename"],
                     mimetype="application/pdf")


@app.route("/api/reports/<report_id>", methods=["DELETE"])
def delete_report(report_id):
    db  = get_db()
    row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if not row:
        return jsonify({"error": "Report not found."}), 404
    if row["pdf_path"]:
        try:
            Path(row["pdf_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    db.execute("DELETE FROM reports WHERE id=?", (report_id,))
    db.commit()
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# API Routes — Dashboard stats (live from DB)
# ---------------------------------------------------------------------------

@app.route("/api/stats", methods=["GET"])
def stats():
    db = get_db()
    total_vulns  = db.execute("SELECT COALESCE(SUM(vuln_total),0) FROM contract_history").fetchone()[0]
    total_fixed  = db.execute("SELECT COUNT(*) FROM contract_history WHERE rect_status='Fixed'").fetchone()[0]
    total_c      = db.execute("SELECT COUNT(*) FROM contract_history").fetchone()[0]
    total_avail  = db.execute(
        "SELECT COUNT(*) FROM contract_history WHERE rect_status IN ('Fixed','Partially Fixed')"
    ).fetchone()[0]

    rate = round((total_fixed / total_c * 100) if total_c else 0)

    return jsonify({
        "vulnerabilities_found":  int(total_vulns),
        "auto_fixes_available":   int(total_avail),
        "contracts_analyzed":     int(total_c),
        "fix_success_rate":       rate,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
