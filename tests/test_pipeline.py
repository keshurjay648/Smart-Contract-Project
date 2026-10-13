from pathlib import Path

from src.pipeline import run_pipeline


def test_pipeline_repairs_and_compiles_contract():
    """Test that the pipeline detects, repairs, compiles, and saves a contract."""

    project_root = Path(__file__).resolve().parents[1]

    contract_path = (
        project_root
        / "sample_contracts"
        / "VulnerableBank.sol"
    )

    result = run_pipeline(contract_path)

    assert result["success"] is True, (
        f"Pipeline failed: {result.get('message')}\n"
        f"Verification: {result.get('verification')}"
    )

    assert result["detection"]["detected"] is True
    assert result["repair"]["success"] is True
    assert result["verification"]["success"] is True

    repaired_path = Path(result["repaired_path"])

    assert repaired_path.is_file()


def test_pipeline_rejects_missing_contract():
    """Test that the pipeline rejects a contract file that does not exist."""

    result = run_pipeline(
        "sample_contracts/ThisFileDoesNotExist.sol"
    )

    assert result["success"] is False
    assert "Source file not found" in result["message"]


def test_pipeline_repair_uses_checks_effects_interactions():
    """
    Test that the repaired contract follows the
    Checks-Effects-Interactions (CEI) pattern.
    """

    project_root = Path(__file__).resolve().parents[1]

    contract_path = (
        project_root
        / "sample_contracts"
        / "VulnerableBank.sol"
    )

    result = run_pipeline(contract_path)

    assert result["success"] is True, (
        f"Pipeline failed: {result.get('message')}"
    )

    assert result["repair"]["success"] is True

    repaired_path = Path(result["repaired_path"])

    assert repaired_path.is_file()

    repaired_code = repaired_path.read_text(
        encoding="utf-8"
    )

    # 1. Verify that the reentrancy guard exists.
    assert 'require(!locked, "Reentrant call");' in repaired_code

    # 2. Verify that the guard is activated.
    assert "locked = true;" in repaired_code

    # 3. Locate the balance update.
    balance_update_position = repaired_code.index(
        "balances[msg.sender] = 0;"
    )

    # 4. Locate the external call.
    external_call_position = repaired_code.index(
        "msg.sender.call{value: amount}("
    )

    # 5. Verify that state changes happen before the external call.
    assert balance_update_position < external_call_position, (
        "Security check failed: the balance must be updated "
        "before the external call."
    )

    # 6. Locate the lock release.
    lock_release_position = repaired_code.index(
        "locked = false;"
    )

    # 7. Verify that the lock is released after the external call.
    assert external_call_position < lock_release_position, (
        "Security check failed: the lock must be released "
        "after the external call."
    )

    # 8. Verify that the transfer result is checked.
    assert 'require(success, "Transfer failed");' in repaired_code