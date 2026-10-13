from pathlib import Path

from src.detector import analyze_file, detect_reentrancy


def test_detects_vulnerable_bank():
    contract_path = (
        Path(__file__).parent.parent
        / "sample_contracts"
        / "VulnerableBank.sol"
    )

    result = analyze_file(str(contract_path))

    assert result["detected"] is True
    assert result["severity"] == "Potential High Risk"


def test_no_external_call():
    source = """
    contract Simple {
        uint256 public value;

        function update() external {
            value = 10;
        }
    }
    """

    result = detect_reentrancy(source)

    assert result["detected"] is False