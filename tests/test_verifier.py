from pathlib import Path

from src.verifier import verify_solidity


def test_original_contract_compiles():
    project_root = Path(__file__).resolve().parents[1]

    source = project_root / "sample_contracts" / "VulnerableBank.sol"
    output = project_root / "reports" / "verification_test"

    result = verify_solidity(source, output)

    assert result["success"] is True, (
        f"{result['message']}\n"
        f"Compiler output:\n{result.get('stderr', '')}"
    )