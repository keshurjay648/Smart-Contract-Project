// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VulnerableBank {
    bool private locked;

    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
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
    }
}