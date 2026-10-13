import subprocess
import shutil
from pathlib import Path


def verify_solidity(source_path, output_dir):
    """
    Compile a Solidity contract and report the compiler result.
    Compilation success does not guarantee security.
    """

    source_path = Path(source_path)
    output_dir = Path(output_dir)

    if not source_path.is_file():
        return {
            "success": False,
            "message": f"Source file not found: {source_path}",
            "output_dir": None,
        }

    output_dir.mkdir(parents=True, exist_ok=True)

    # Locate the npm executable.
    npx_path = shutil.which("npx.cmd") or shutil.which("npx")

    if npx_path is None:
        return {
            "success": False,
            "message": (
                "npx was not found. Check your Node.js installation and PATH."
            ),
            "output_dir": str(output_dir.resolve()),
        }

    command = [
        npx_path,
        "--yes",
        "solc@0.8.30",
        "--bin",
        "--abi",
        str(source_path.resolve()),
        "-o",
        str(output_dir.resolve()),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
            shell=(npx_path.lower().endswith(".cmd")),
        )

        success = result.returncode == 0

        return {
            "success": success,
            "message": (
                "Compilation successful."
                if success
                else "Compilation failed."
            ),
            "stdout": result.stdout,
            "stderr": result.stderr,
            "output_dir": str(output_dir.resolve()),
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "message": "Compilation timed out.",
            "output_dir": str(output_dir.resolve()),
        }

    except OSError as exc:
        return {
            "success": False,
            "message": f"Could not start the compiler: {exc}",
            "output_dir": str(output_dir.resolve()),
        }