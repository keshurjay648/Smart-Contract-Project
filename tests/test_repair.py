from src.repair import repair_reentrancy


def vulnerable_bank_source():
    return """
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];

        require(amount > 0, "Insufficient balance");

        (bool success, ) = msg.sender.call{value: amount}("");

        require(success, "Transfer failed");

        balances[msg.sender] = 0;
    }
}
"""


def test_repair_adds_reentrancy_lock():
    source_code = vulnerable_bank_source()

    result = repair_reentrancy(source_code)

    assert result["success"] is True
    assert "bool private locked;" in result["repaired_code"]
    assert 'require(!locked, "Reentrant call");' in result["repaired_code"]
    assert "locked = true;" in result["repaired_code"]
    assert "locked = false;" in result["repaired_code"]


def test_repair_rejects_unsupported_contract():
    source_code = """
pragma solidity ^0.8.20;

contract DifferentContract {
    function example() external {}
}
"""

    result = repair_reentrancy(source_code)

    assert result["success"] is False
    assert result["repaired_code"] == source_code


def test_repair_rejects_contract_with_existing_guard():
    source_code = vulnerable_bank_source().replace(
        "contract VulnerableBank {",
        "contract VulnerableBank {\n    bool private nonReentrant;",
    )

    result = repair_reentrancy(source_code)

    assert result["success"] is False
    assert result["repaired_code"] == source_code


def test_lock_is_set_before_external_call():
    source_code = vulnerable_bank_source()

    result = repair_reentrancy(source_code)

    assert result["success"] is True

    repaired_code = result["repaired_code"]

    lock_position = repaired_code.index("locked = true;")
    external_call_position = repaired_code.index(
        'msg.sender.call{value: amount}("")'
    )

    assert lock_position < external_call_position


def test_lock_is_released_after_balance_update():
    source_code = vulnerable_bank_source()

    result = repair_reentrancy(source_code)

    assert result["success"] is True

    repaired_code = result["repaired_code"]

    balance_update_position = repaired_code.index(
        "balances[msg.sender] = 0;"
    )
    lock_release_position = repaired_code.index("locked = false;")

    assert balance_update_position < lock_release_position