import re


def repair_reentrancy(source_code: str) -> dict:
    """
    Apply a controlled CEI-based reentrancy repair to the
    supported VulnerableBank example.

    The repair:
    1. Adds a reentrancy lock.
    2. Checks the withdrawal amount.
    3. Updates the balance before the external call.
    4. Transfers funds.
    5. Reverts if the transfer fails.

    This is a pattern-specific repair, not a universal
    Solidity security fixer.
    """

    # Step 1: Confirm the supported contract.
    if not re.search(r"\bcontract\s+VulnerableBank\b", source_code):
        return {
            "success": False,
            "message": "Unsupported contract: expected VulnerableBank.",
            "repaired_code": source_code,
        }

    # Step 2: Locate the withdrawal function.
    withdraw_pattern = re.compile(
        r"\bfunction\s+withdraw\s*\(\s*\)\s+external\b"
        r"(?:\s+payable)?\s*\{"
    )

    withdraw_match = withdraw_pattern.search(source_code)

    if not withdraw_match:
        return {
            "success": False,
            "message": "Expected withdraw() function was not found.",
            "repaired_code": source_code,
        }

    # Step 3: Reject contracts already containing a guard.
    if re.search(r"\bbool\s+private\s+locked\s*;", source_code):
        return {
            "success": False,
            "message": "A reentrancy lock already exists.",
            "repaired_code": source_code,
        }

    if "nonReentrant" in source_code:
        return {
            "success": False,
            "message": "An existing nonReentrant guard was detected.",
            "repaired_code": source_code,
        }

    # Step 4: Locate the contract declaration.
    contract_pattern = re.compile(
        r"(\bcontract\s+VulnerableBank\b[^{]*\{)"
    )

    contract_match = contract_pattern.search(source_code)

    if not contract_match:
        return {
            "success": False,
            "message": "Could not safely locate the contract declaration.",
            "repaired_code": source_code,
        }

    # Step 5: Add the lock variable.
    repaired_code = (
        source_code[:contract_match.end()]
        + "\n    bool private locked;\n"
        + source_code[contract_match.end():]
    )

    # Step 6: Replace the complete withdraw() function.
    # This intentionally supports only the known example.
    withdraw_pattern = re.compile(
        r"\bfunction\s+withdraw\s*\(\s*\)\s+external\b"
        r"(?:\s+payable)?\s*\{"
    )

    withdraw_match = withdraw_pattern.search(repaired_code)

    if not withdraw_match:
        return {
            "success": False,
            "message": "Could not locate withdraw() after adding the lock.",
            "repaired_code": source_code,
        }

    # Find the matching closing brace for withdraw().
    opening_brace = repaired_code.find("{", withdraw_match.start())

    depth = 0
    closing_brace = None

    for index in range(opening_brace, len(repaired_code)):
        if repaired_code[index] == "{":
            depth += 1
        elif repaired_code[index] == "}":
            depth -= 1

            if depth == 0:
                closing_brace = index
                break

    if closing_brace is None:
        return {
            "success": False,
            "message": "Could not safely identify the end of withdraw().",
            "repaired_code": source_code,
        }

    # Step 7: Generate the CEI-based withdrawal function.
    repaired_withdraw = '''function withdraw() external {
        require(!locked, "Reentrant call");
        locked = true;

        uint256 amount = balances[msg.sender];
        require(amount > 0, "Insufficient balance");

        // Effects: update state before the external interaction.
        balances[msg.sender] = 0;

        // Interaction: transfer funds after updating state.
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        locked = false;
    }'''

    repaired_code = (
        repaired_code[:withdraw_match.start()]
        + repaired_withdraw
        + repaired_code[closing_brace + 1:]
    )

    # Step 8: Return the repaired source code.
    return {
        "success": True,
        "message": (
            "Applied a CEI-based withdrawal repair and reentrancy guard "
            "to the supported VulnerableBank example. Compilation and "
            "security testing are still required."
        ),
        "repaired_code": repaired_code,
    }