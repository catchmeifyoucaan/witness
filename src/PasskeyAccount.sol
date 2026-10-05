// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {WebAuthn} from "./WebAuthn.sol";

/// @title PasskeyAccount
/// @notice A contract account. The passkey is the authority. Whoever submits `execute` is only
///         the gas payer (a relayer, or the demo's burner EOA). There is no secp256k1 key
///         derived from the passkey, and this contract is not an EIP-7702 delegation.
///
/// The challenge bound into `clientDataJSON` is
/// `keccak256(abi.encode(account, nonce, to, value, data, chainid, deadline))`.
/// The WebAuthn challenge is those exact 32 bytes, base64url-encoded by the browser.
contract PasskeyAccount {
    error Expired();
    error BadRecipient();
    error CallFailed();
    error BadKey();
    error BadRpId();
    error BadOrigin();

    uint256 public immutable qx;
    uint256 public immutable qy;
    bool public immutable allowLocalDevOrigins;

    uint256 public nonce;
    string public rpId;
    string public origin;

    event Executed(address indexed to, uint256 value, uint256 indexed nonce, bytes32 challenge);

    constructor(uint256 qx_, uint256 qy_, string memory rpId_, string memory origin_, bool allowLocal_) {
        if (qx_ == 0 || qy_ == 0) revert BadKey();
        if (bytes(rpId_).length == 0 || bytes(rpId_).length > 253) revert BadRpId();
        if (bytes(origin_).length == 0 || bytes(origin_).length > 200) revert BadOrigin();
        qx = qx_;
        qy = qy_;
        rpId = rpId_;
        origin = origin_;
        allowLocalDevOrigins = allowLocal_;
    }

    receive() external payable {}

    function challengeFor(address to, uint256 value, bytes calldata data, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _challenge(to, value, data, deadline);
    }

    /// @notice Hash the contract itself will hand to the P256 precompile. The page may display
    ///         this. It is not an authorization.
    function assertionHash(bytes calldata authenticatorData, bytes calldata clientDataJSON)
        external
        pure
        returns (bytes32)
    {
        return WebAuthn.messageHash(authenticatorData, clientDataJSON);
    }

    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 deadline,
        bytes calldata authenticatorData,
        bytes calldata clientDataJSON,
        uint256 r,
        uint256 s
    ) external payable {
        if (block.timestamp > deadline) revert Expired();
        if (to == address(0)) revert BadRecipient();

        bytes32 challenge = _challenge(to, value, data, deadline);
        WebAuthn.verify(challenge, rpId, origin, allowLocalDevOrigins, authenticatorData, clientDataJSON, r, s, qx, qy);

        // Consume the approval before the call, so a recipient cannot replay it.
        nonce = nonce + 1;
        (bool ok,) = to.call{value: value}(data);
        if (!ok) revert CallFailed();
        emit Executed(to, value, nonce, challenge);
    }

    function _challenge(address to, uint256 value, bytes calldata data, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(address(this), nonce, to, value, data, block.chainid, deadline));
    }
}
