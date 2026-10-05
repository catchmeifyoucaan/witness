// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title P256
/// @notice Thin caller for Monad's P256VERIFY precompile (EIP-7951) at `0x0100`.
///
/// Input is exactly 160 bytes: `hash || r || s || qx || qy`, each a 32-byte big-endian word.
/// The precompile does not hash again. `hash` is already the digest.
/// Success is a 32-byte `1`. Failure, including a short or malformed input, is empty returndata.
/// The documented gas price is 6900. Monad still charges the transaction gas limit, not this figure.
///
/// High-s is accepted on purpose. EIP-7951's verification equation treats `(r, n-s)` as valid,
/// and a live `eth_call` to Monad testnet `0x0100` on 2026-10-04 returned `1` for both `s` and
/// `n-s` of the Wycheproof vector in the Forge fork test. WebAuthn authenticators do not
/// canonicalize `s`. Rejecting the high half would fail about half of real Face ID, Touch ID,
/// and Windows Hello approvals. A flipped `s` is a second encoding of the same approval;
/// `PasskeyAccount`'s nonce consumes that approval on first inclusion.
library P256 {
    address internal constant VERIFIER = address(0x0100);

    /// @dev Documented precompile price, from https://docs.monad.xyz/developer-essentials/precompiles
    uint256 internal constant VERIFY_GAS = 6900;

    function verify(bytes32 hash, uint256 r, uint256 s, uint256 qx, uint256 qy) internal view returns (bool) {
        (bool ok, bytes memory result) = VERIFIER.staticcall(abi.encodePacked(hash, r, s, qx, qy));
        return ok && result.length == 32 && uint256(bytes32(result)) == 1;
    }
}
