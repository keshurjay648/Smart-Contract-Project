import re
from pathlib import Path


def detect_reentrancy(source_code: str) -> dict:
    """
    Detect a narrow potential reentrancy pattern:
    a low-level external call followed by a balances state update.

    This is a preliminary pattern detector, not a complete
    smart-contract security analyzer.
    """

    external_call_pattern = re.compile(
        r"\.call\s*(?:\{[^}]*\})?\s*\(",
        re.DOTALL,
    )

    call_match = external_call_pattern.search(source_code)

    if not call_match:
        return {
            "detected": False,
            "severity": "None",
            "message": "No supported low-level external call pattern found.",
            "line": None,
        }

    # Find the line where the external call occurs.
    line_number = source_code.count(
        "\n", 0, call_match.start()
    ) + 1

    # Find the function containing the external call.
    function_start = source_code.rfind(
        "function ", 0, call_match.start()
    )

    if function_start == -1:
        return {
            "detected": False,
            "severity": "Unknown",
            "message": (
                "An external call was found, but its containing "
                "function could not be identified."
            ),
            "line": line_number,
        }

    # Limit analysis to the function containing the call.
    function_body_start = source_code.find(
        "{", function_start
    )

    if function_body_start == -1:
        return {
            "detected": False,
            "severity": "Unknown",
            "message": "Could not identify the function body.",
            "line": line_number,
        }

    brace_depth = 0
    function_end = None

    for index in range(function_body_start, len(source_code)):
        if source_code[index] == "{":
            brace_depth += 1
        elif source_code[index] == "}":
            brace_depth -= 1

            if brace_depth == 0:
                function_end = index
                break

    if function_end is None:
        return {
            "detected": False,
            "severity": "Unknown",
            "message": "Could not identify the end of the function.",
            "line": line_number,
        }

    function_body = source_code[
        function_body_start:function_end + 1
    ]

    call_position = call_match.start() - function_body_start
    remaining_code = function_body[call_position:]

    # Look for a balances mapping assignment after the external call.
    state_update_pattern = re.compile(
        r"\bbalances\s*\[[^\]]+\]\s*(?:\+|-)?=",
        re.DOTALL,
    )

    update_match = state_update_pattern.search(remaining_code)

    if update_match:
        return {
            "detected": True,
            "severity": "Potential High Risk",
            "message": (
                "Potential reentrancy pattern: an external call "
                "appears before a subsequent balances state update."
            ),
            "line": line_number,
        }

    return {
        "detected": False,
        "severity": "Unknown",
        "message": (
            "No matching external-call-before-balances-update "
            "pattern was found. This does not prove the contract is safe."
        ),
        "line": line_number,
    }


def detect_vulnerability(source_code: str) -> dict:
    """
    Compatibility function used by pipeline.py.
    """

    return detect_reentrancy(source_code)


def analyze_file(file_path: str) -> dict:
    """Read a Solidity file and analyze its source."""

    path = Path(file_path)

    if not path.is_file():
        raise FileNotFoundError(
            f"Contract not found: {path}"
        )

    source_code = path.read_text(encoding="utf-8")

    return detect_vulnerability(source_code)