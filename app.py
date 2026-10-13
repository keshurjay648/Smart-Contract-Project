import streamlit as st
from pathlib import Path
import tempfile

from src.pipeline import run_pipeline


# --------------------------------------------------
# Page configuration
# --------------------------------------------------

st.set_page_config(
    page_title="Smart Contract Rectification Engine",
    page_icon="🛡️",
    layout="wide",
)


# --------------------------------------------------
# Dashboard header
# --------------------------------------------------

st.title("🛡️ Automated Smart Contract Vulnerability Rectification Engine")

st.markdown(
    """
    Analyze a Solidity smart contract, detect a supported reentrancy
    vulnerability, attempt an automated repair, and verify compilation.
    """
)

st.info(
    "Prototype limitation: automated repair currently supports a "
    "specific reentrancy pattern. Compilation does not prove that a "
    "contract is completely secure."
)

st.divider()


# --------------------------------------------------
# Sidebar
# --------------------------------------------------

st.sidebar.header("Project Information")

st.sidebar.markdown(
    """
    **Project:** Smart Contract Rectification

    **Detection:** Reentrancy pattern

    **Repair:** Checks-Effects-Interactions and reentrancy guard

    **Verification:** Solidity compilation
    """
)

st.sidebar.caption("Academic prototype — not a production security auditor.")


# --------------------------------------------------
# Contract selection
# --------------------------------------------------

st.subheader("📂 Upload Smart Contract")

uploaded_file = st.file_uploader(
    "Choose a Solidity (.sol) file",
    type=["sol"],
)

project_root = Path(__file__).resolve().parent
sample_path = project_root / "sample_contracts" / "VulnerableBank.sol"

use_sample = st.checkbox(
    "Use the included VulnerableBank.sol demonstration contract",
    value=uploaded_file is None,
)

if use_sample and uploaded_file is not None:
    st.caption(
        "The sample contract is selected. Uncheck this option to use "
        "your uploaded file."
    )


# --------------------------------------------------
# Run pipeline
# --------------------------------------------------

if st.button("🔍 Analyze and Rectify Contract", type="primary"):

    source_path = None

    try:
        if use_sample:
            if not sample_path.is_file():
                st.error("The sample VulnerableBank.sol file was not found.")
                st.stop()

            source_path = sample_path

        elif uploaded_file is not None:
            if not uploaded_file.name.lower().endswith(".sol"):
                st.error("Please upload a Solidity (.sol) file.")
                st.stop()

            # Save the upload to a temporary directory.
            # Do not overwrite the original sample contract.
            with tempfile.TemporaryDirectory(
                prefix="contract_upload_"
            ) as temp_dir:

                source_path = Path(temp_dir) / "UploadedContract.sol"

                source_path.write_bytes(uploaded_file.getvalue())

                st.session_state["pipeline_result"] = run_pipeline(
                    source_path
                )

        else:
            st.warning("Please upload a Solidity file or select the sample.")
            st.stop()

        if use_sample:
            st.session_state["pipeline_result"] = run_pipeline(
                source_path
            )

    except Exception as exc:
        st.error(f"An unexpected error occurred: {exc}")


# --------------------------------------------------
# Display results
# --------------------------------------------------

result = st.session_state.get("pipeline_result")

if result:
    st.divider()
    st.header("📊 Analysis Results")

    detection = result.get("detection", {})
    repair = result.get("repair", {})
    verification = result.get("verification", {})

    col1, col2, col3 = st.columns(3)

    with col1:
        if detection.get("detected", False):
            st.warning("⚠️ Supported vulnerability detected")
        else:
            st.info("No supported vulnerability detected")

    with col2:
        if repair.get("success", False):
            st.success("Repair applied")
        elif repair:
            st.error("Repair not applied")
        else:
            st.info("Repair not attempted")

    with col3:
        if verification.get("success", False):
            st.success("Compilation successful")
        elif verification:
            st.error("Compilation failed")
        else:
            st.info("Compilation not performed")

    st.subheader("Pipeline Status")
    st.write(result.get("message", "No status message available."))

    if detection:
        with st.expander("🔎 Vulnerability Detection Details", expanded=True):
            st.json(detection)

    if repair:
        with st.expander("🔧 Repair Details", expanded=True):
            st.json(
                {
                    key: value
                    for key, value in repair.items()
                    if key != "repaired_code"
                }
            )

    if verification:
        with st.expander("✅ Compilation Verification Details"):
            st.json(verification)

    st.divider()
    st.header("📝 Contract Source Code")

    original_code = None
    repaired_code = repair.get("repaired_code")

    if result.get("original_path"):
        original_path = Path(result["original_path"])

        if original_path.is_file():
            original_code = original_path.read_text(encoding="utf-8")

    elif use_sample and sample_path.is_file():
        original_code = sample_path.read_text(encoding="utf-8")

    original_col, repaired_col = st.columns(2)

    with original_col:
        st.subheader("Original Contract")

        if original_code:
            st.code(original_code, language="solidity")
        else:
            st.caption(
                "Original source is unavailable in the current session."
            )

    with repaired_col:
        st.subheader("Repaired Contract")

        if repaired_code:
            st.code(repaired_code, language="solidity")
        else:
            st.caption("No repaired source was returned.")

    if result.get("repaired_path"):
        repaired_path = Path(result["repaired_path"])

        if repaired_path.is_file():
            st.download_button(
                label="⬇️ Download Repaired Contract",
                data=repaired_path.read_bytes(),
                file_name=repaired_path.name,
                mime="text/plain",
            )

    st.divider()

    st.subheader("🧪 Runtime Security Testing")
    st.info(
        "Runtime attack testing has not been demonstrated by this dashboard. "
        "The result above reports compilation verification, not proof of "
        "resistance to every exploit."
    )

st.divider()

st.caption(
    "Automated Smart Contract Vulnerability Rectification Engine | "
    "Academic Project Prototype"
)