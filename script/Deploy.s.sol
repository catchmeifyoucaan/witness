// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";

/// @notice Deploys the factory. The passkey accounts themselves are created later by the page.
///         Monad bills the gas limit of this transaction, so pass an explicit `--gas-limit`
///         instead of accepting a wallet's fallback. 1_600_000 is enough for this contract
///         and still a small MON amount at the minimum base fee.
contract Deploy is Script {
    function run() external returns (PasskeyAccountFactory factory) {
        vm.startBroadcast();
        factory = new PasskeyAccountFactory();
        vm.stopBroadcast();
        console2.log("PasskeyAccountFactory", address(factory));
    }
}
