// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PasskeyAccount} from "./PasskeyAccount.sol";

/// @title PasskeyAccountFactory
/// @notice Deploys one CREATE2 account per passkey, rpId, and origin. Calling it again returns
///         the account that is already there.
contract PasskeyAccountFactory {
    event AccountCreated(
        address indexed account,
        bytes32 indexed salt,
        uint256 qx,
        uint256 qy,
        string rpId,
        string origin,
        bool allowLocalDevOrigins
    );

    function saltFor(uint256 qx, uint256 qy, string memory rpId, string memory origin, bool allowLocalDevOrigins)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(qx, qy, keccak256(bytes(rpId)), keccak256(bytes(origin)), allowLocalDevOrigins));
    }

    function predict(uint256 qx, uint256 qy, string memory rpId, string memory origin, bool allowLocalDevOrigins)
        public
        view
        returns (address predicted)
    {
        bytes32 salt = saltFor(qx, qy, rpId, origin, allowLocalDevOrigins);
        bytes32 initHash = keccak256(
            abi.encodePacked(type(PasskeyAccount).creationCode, abi.encode(qx, qy, rpId, origin, allowLocalDevOrigins))
        );
        predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash)))));
    }

    function createAccount(uint256 qx, uint256 qy, string memory rpId, string memory origin, bool allowLocalDevOrigins)
        external
        returns (address account)
    {
        bytes32 salt = saltFor(qx, qy, rpId, origin, allowLocalDevOrigins);
        account = predict(qx, qy, rpId, origin, allowLocalDevOrigins);
        if (account.code.length != 0) return account;
        account = address(new PasskeyAccount{salt: salt}(qx, qy, rpId, origin, allowLocalDevOrigins));
        emit AccountCreated(account, salt, qx, qy, rpId, origin, allowLocalDevOrigins);
    }
}
