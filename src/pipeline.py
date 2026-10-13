from pathlib import Path

from src.detector import detect_vulnerability
from src.repair import repair_reentrancy
from src.verifier import verify_solidity


def run_pipeline(source_path):
    """
    Run vulnerability detection, attempt a supported repair,
    and verify the repaired Solidity contract through compilation.
    """

    source_path = Path(source_path)

    # Stage 1: Check whether the source file exists.
    if not source_path.is_file():
        return {
            "success": False,
            "message": f"Source file not found: {source_path}",
        }

    # Read the original Solidity contract.
    original_code = source_path.read_text(encoding="utf-8")

    # Stage 2: Detect vulnerability.
    detection_result = detect_vulnerability(original_code)

    # Stop if no vulnerability was detected.
    if not detection_result.get("detected", False):
        return {
            "success": False,
            "message": "No supported vulnerability was detected.",
            "detection": detection_result,
        }

    # Stage 3: Attempt the supported reentrancy repair.
    repair_result = repair_reentrancy(original_code)

    if not repair_result.get("success", False):
        return {
            "success": False,
            "message": "Vulnerability detected, but no supported repair was applied.",
            "detection": detection_result,
            "repair": repair_result,
        }

    # Stage 4: Save the repaired contract separately.
    project_root = Path(__file__).resolve().parents[1]

    repaired_dir = project_root / "reports" / "repaired"
    repaired_dir.mkdir(parents=True, exist_ok=True)

    repaired_path = repaired_dir / source_path.name

    repaired_path.write_text(
        repair_result["repaired_code"],
        encoding="utf-8",
    )

    # Stage 5: Compile the repaired contract.
    verification_dir = project_root / "reports" / "verified"

    verification_result = verify_solidity(
        repaired_path,
        verification_dir,
    )

    # Stage 6: Return the complete pipeline result.
    return {
        "success": verification_result["success"],
        "message": (
            "Repair applied and compilation succeeded."
            if verification_result["success"]
            else "Repair was applied, but compilation failed."
        ),
        "detection": detection_result,
        "repair": repair_result,
        "verification": verification_result,
        "original_path": str(source_path.resolve()),
        "repaired_path": str(repaired_path.resolve()),
    }