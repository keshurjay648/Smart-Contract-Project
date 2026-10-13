# Automated Smart Contract Vulnerability Rectification Engine

A prototype that detects a supported smart-contract vulnerability pattern, applies an automated source-code repair, and checks whether the repaired Solidity contract compiles.

> **Project status:** Working prototype for a supported reentrancy example. This is not a general-purpose smart-contract auditor, and successful compilation does not prove that a contract is secure.

## Overview

Smart contracts can contain vulnerabilities that attackers exploit to cause unintended behavior or financial loss. This project explores a workflow for identifying a supported vulnerability pattern and generating a repaired version of the Solidity source code.

The current demonstration uses a sample `VulnerableBank.sol` contract with a reentrancy-prone withdrawal function.

### Current workflow

1. **Upload or select a Solidity contract** in the Streamlit dashboard.
2. **Detect** a supported reentrancy pattern.
3. **Repair** the supported withdrawal function using a Checks-Effects-Interactions-style ordering and a reentrancy lock.
4. **Verify compilation** using the Solidity compiler.
5. **Review and download** the repaired Solidity source.

## Features

- Streamlit-based web dashboard.
- Pattern-based detection for the supported sample vulnerability.
- Automated repair for the expected `VulnerableBank` contract structure.
- Solidity compilation verification through `npx solc`.
- Generated repaired-contract output.
- Pytest unit and pipeline tests.
- Hardhat project scaffold for future runtime security tests.

## Technology Stack

- **Python**
- **Streamlit**
- **Solidity**
- **Node.js / npm / npx**
- **Solidity compiler (`solc`)**
- **Hardhat** (runtime testing work in progress)
- **pytest**

## Project Structure

```text
SmartContractRectification/
├── app.py
├── src/
│   ├── detector.py
│   ├── repair.py
│   ├── verifier.py
│   └── pipeline.py
├── sample_contracts/
│   └── VulnerableBank.sol
├── tests/
│   ├── test_detector.py
│   ├── test_pipeline.py
│   ├── test_repair.py
│   └── test_verifier.py
├── security-tests/
│   ├── hardhat.config.ts
│   ├── package.json
│   └── ...
├── reports/
│   ├── original/
│   └── repaired/
└── .gitignore
```

Generated report files may vary depending on what has been run locally.

## Requirements

Install the following before running the project:

- Python 3.10 or later (use a version supported by your installed dependencies)
- Node.js and npm
- Git (optional, for version control)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/Smart-Contract-Project.git
cd Smart-Contract-Project
```

Replace `YOUR-USERNAME` with the GitHub account that owns the repository.

### 2. Create and activate a Python virtual environment

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Git Bash:**

```bash
python -m venv .venv
source .venv/Scripts/activate
```

### 3. Install Python dependencies

If the repository contains a `requirements.txt`, run:

```bash
pip install -r requirements.txt
```

If there is no `requirements.txt` yet, install the main dashboard and test dependencies:

```bash
pip install streamlit pytest
```

If the project imports additional Python packages, install those too. It is recommended to add a `requirements.txt` containing the exact project dependencies before sharing the project with others.

### 4. Check Node.js and npx

```bash
node --version
npm --version
npx --version
```

The verifier invokes the Solidity compiler through `npx`. An internet connection may be needed the first time the compiler package is downloaded.

## Run the Dashboard

From the project root, with the Python virtual environment activated:

```bash
streamlit run app.py
```

Open the local URL printed in the terminal, usually:

```text
http://localhost:8501
```

Select the bundled sample contract or upload a supported `.sol` file, then run the analysis pipeline.

## Run Tests

From the project root:

```bash
pytest -v
```

A previous local run completed with **11 tests passing**. Run the tests again on your current checkout to confirm the latest result.

## Sample Contract

The bundled `sample_contracts/VulnerableBank.sol` demonstrates a withdrawal flow where an external call is made before the user's balance is reset. In a reentrancy scenario, an external contract may call back into the withdrawal function before the original call has completed.

The prototype's repair routine is designed for this supported example and applies a reentrancy lock and updates state before the external transfer. Review the generated code carefully before using it for any purpose beyond the demonstration.

## Limitations and Security Notes

- **Limited detection coverage:** detection is pattern-based and does not replace a professional security audit.
- **Limited repair coverage:** the repair routine expects a particular contract/function structure. Other contracts may not be supported.
- **Compilation is not a security proof:** a contract can compile successfully and still contain vulnerabilities.
- **Runtime exploit testing is not yet demonstrated:** the Hardhat setup is currently a foundation for future attacker-contract and regression tests.
- **Review repairs manually:** generated source code must be reviewed and tested before any deployment.
- **Do not deploy the prototype's output to mainnet or use it to protect real funds.**

## Planned Improvements

- Add a Hardhat attacker contract and runtime tests for the vulnerable and repaired versions.
- Expand detection and repair coverage to additional vulnerability classes.
- Improve handling of unsupported contracts and repair failures.
- Add source-code diffs, line-level findings, and downloadable reports.
- Add regression and edge-case tests.
- Improve upload validation, unique output naming, and deployment hardening.
- Evaluate the system against a broader collection of vulnerable and secure contracts.

## Academic Project

This project is being developed as an academic prototype to explore automated smart-contract vulnerability detection and source-code rectification.

**Team**
- NENE SAUMITRA 
- SINGH ADITYA 
- KESHUR JAY
- BIRRU UDAYKIRAN 

**Institution:** Universal College of Engineering, Kaman, Vasai (E)

## Disclaimer

This project is for educational and research purposes only. It is provided without any guarantee that detected issues are exhaustive or that generated repairs are secure. Always use independent testing and a qualified security review before deploying smart contracts.
