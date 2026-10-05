// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {P256} from "./P256.sol";

/// @title WebAuthn
/// @notice Checks a passkey assertion inside the transaction. The browser is not trusted.
///
/// The digest given to the P256 precompile is
/// `sha256(authenticatorData || sha256(clientDataJSON))`, which is the ES256 message.
library WebAuthn {
    error BadAuthenticatorData();
    error UserNotPresent();
    error UserNotVerified();
    error RpIdMismatch();
    error BadClientData();
    error BadClientDataType();
    error OriginMismatch();
    error ChallengeMismatch();
    error CrossOrigin();
    error SignatureInvalid();

    uint256 internal constant MAX_AUTH_DATA = 512;
    uint256 internal constant MAX_CLIENT_DATA = 1024;

    /// @dev Demo origins. A production account sets `allowLocalDevOrigins` to false and is then
    ///      bound only to the origin stored at deployment. No production hostname is hardcoded.
    bytes32 internal constant LOCAL_ORIGIN = keccak256("http://localhost:5173");
    bytes32 internal constant LOOPBACK_ORIGIN = keccak256("http://127.0.0.1:5173");

    function messageHash(bytes memory authenticatorData, bytes memory clientDataJSON) internal pure returns (bytes32) {
        return sha256(bytes.concat(authenticatorData, sha256(clientDataJSON)));
    }

    /// @dev Unpadded base64url of a 32-byte challenge, matching `base64.urlsafe_b64encode(raw).rstrip("=")`.
    function b64url32(bytes32 data) internal pure returns (bytes memory out) {
        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        out = new bytes(43);
        uint256 p;
        for (uint256 c; c < 10; ++c) {
            uint256 i = c * 3;
            uint256 n =
                (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8) | uint256(uint8(data[i + 2]));
            out[p++] = alphabet[(n >> 18) & 63];
            out[p++] = alphabet[(n >> 12) & 63];
            out[p++] = alphabet[(n >> 6) & 63];
            out[p++] = alphabet[n & 63];
        }
        uint256 m = (uint256(uint8(data[30])) << 8) | uint256(uint8(data[31]));
        out[p++] = alphabet[(m >> 10) & 63];
        out[p++] = alphabet[(m >> 4) & 63];
        out[p++] = alphabet[(m << 2) & 63];
    }

    function verify(
        bytes32 challenge,
        string memory rpId,
        string memory origin,
        bool allowLocalDevOrigins,
        bytes calldata authenticatorData,
        bytes calldata clientDataJSON,
        uint256 r,
        uint256 s,
        uint256 qx,
        uint256 qy
    ) internal view {
        if (authenticatorData.length < 37 || authenticatorData.length > MAX_AUTH_DATA) {
            revert BadAuthenticatorData();
        }
        uint8 flags = uint8(authenticatorData[32]);
        // Bit 0 is User Present. Bit 2 is User Verified. Both are required: the product asks
        // the platform authenticator for userVerification "required", and a signature that
        // only says "someone touched the device" must not move MON.
        if ((flags & 0x01) == 0) revert UserNotPresent();
        if ((flags & 0x04) == 0) revert UserNotVerified();
        if (bytes32(authenticatorData[:32]) != sha256(bytes(rpId))) revert RpIdMismatch();

        if (clientDataJSON.length == 0 || clientDataJSON.length > MAX_CLIENT_DATA) revert BadClientData();

        bytes memory typ = _stringField(clientDataJSON, '"type"');
        if (keccak256(typ) != keccak256("webauthn.get")) revert BadClientDataType();

        bytes memory gotOrigin = _stringField(clientDataJSON, '"origin"');
        if (!_originOk(gotOrigin, origin, allowLocalDevOrigins)) revert OriginMismatch();

        bytes memory gotChallenge = _stringField(clientDataJSON, '"challenge"');
        if (!_eqDropPad(gotChallenge, b64url32(challenge))) revert ChallengeMismatch();

        // Policy, not just a hash check. The signature covers clientDataJSON, but a
        // cross-origin ceremony the authenticator actually signed must still be refused.
        _requireCrossOriginFalse(clientDataJSON);

        if (!P256.verify(messageHash(authenticatorData, clientDataJSON), r, s, qx, qy)) {
            revert SignatureInvalid();
        }
    }


    /// @dev Requires a top-level `"crossOrigin": false`. Missing, true, or a non-literal fails.
    function _requireCrossOriginFalse(bytes calldata json) private pure {
        (uint256 at, bool found) = _literalAt(json, '"crossOrigin"');
        if (!found) revert BadClientData();
        if (_isFalse(json, at)) return;
        revert CrossOrigin();
    }

    function _isFalse(bytes calldata json, uint256 at) private pure returns (bool) {
        if (at + 5 > json.length) return false;
        if (
            json[at] != 0x66 || json[at + 1] != 0x61 || json[at + 2] != 0x6c || json[at + 3] != 0x73
                || json[at + 4] != 0x65
        ) return false;
        if (at + 5 == json.length) return true;
        bytes1 next = json[at + 5];
        return next == 0x7d || next == 0x2c || next == 0x20 || next == 0x09 || next == 0x0a || next == 0x0d;
    }

    /// @dev Index of the first non-whitespace byte of a non-string literal after `key`.
    function _literalAt(bytes calldata json, bytes memory key) private pure returns (uint256 at, bool found) {
        uint256 n = json.length;
        uint256 k = key.length;
        if (k == 0 || n < k + 3) return (0, false);
        for (uint256 i; i + k < n; ++i) {
            bool eq = true;
            for (uint256 j; j < k; ++j) {
                if (json[i + j] != key[j]) {
                    eq = false;
                    break;
                }
            }
            if (!eq) continue;
            if (!_isKeyStart(json, i)) continue;
            uint256 cpos = _skipWs(json, i + k);
            if (cpos >= n || json[cpos] != 0x3a) continue;
            cpos = _skipWs(json, cpos + 1);
            if (cpos >= n || json[cpos] == 0x22) continue;
            return (cpos, true);
        }
        return (0, false);
    }

    function _originOk(bytes memory got, string memory configured, bool allowLocal) private pure returns (bool) {
        bytes32 h = keccak256(got);
        if (h == keccak256(bytes(configured))) return true;
        if (!allowLocal) return false;
        return h == LOCAL_ORIGIN || h == LOOPBACK_ORIGIN;
    }

    function _eqDropPad(bytes memory got, bytes memory expected) private pure returns (bool) {
        uint256 n = got.length;
        while (n > 0 && got[n - 1] == 0x3d) {
            unchecked {
                --n;
            }
        }
        if (n != expected.length) return false;
        for (uint256 i; i < n; ++i) {
            if (got[i] != expected[i]) return false;
        }
        return true;
    }

    /// @dev Finds a JSON string field whose key is preceded by `{` or `,`. Rejects escapes.
    ///      Browser `clientDataJSON` is compact and has no escaped slashes. A backslash is a
    ///      hard failure so a weird encoding cannot be mistaken for a matching origin.
    function _stringField(bytes calldata json, bytes memory key) private pure returns (bytes memory) {
        (uint256 start, uint256 len, bool found) = _locate(json, key);
        if (!found || len == 0 || len > 200) revert BadClientData();
        bytes memory out = new bytes(len);
        for (uint256 i; i < len; ++i) {
            bytes1 c = json[start + i];
            if (c == 0x5c) revert BadClientData();
            out[i] = c;
        }
        return out;
    }

    function _locate(bytes calldata json, bytes memory key)
        private
        pure
        returns (uint256 start, uint256 len, bool found)
    {
        uint256 n = json.length;
        uint256 k = key.length;
        if (k == 0 || n < k + 3) return (0, 0, false);
        for (uint256 i; i + k < n; ++i) {
            bool eq = true;
            for (uint256 j; j < k; ++j) {
                if (json[i + j] != key[j]) {
                    eq = false;
                    break;
                }
            }
            if (!eq) continue;
            if (!_isKeyStart(json, i)) continue;
            uint256 cpos = i + k;
            cpos = _skipWs(json, cpos);
            if (cpos >= n || json[cpos] != 0x3a) continue;
            cpos = _skipWs(json, cpos + 1);
            if (cpos >= n || json[cpos] != 0x22) continue;
            uint256 v = cpos + 1;
            while (v < n && json[v] != 0x22) {
                if (json[v] == 0x5c) {
                    if (v + 1 >= n) return (0, 0, false);
                    v += 2;
                    continue;
                }
                ++v;
            }
            if (v >= n) continue;
            return (cpos + 1, v - (cpos + 1), true);
        }
        return (0, 0, false);
    }

    function _isKeyStart(bytes calldata json, uint256 i) private pure returns (bool) {
        if (i == 0) return false;
        uint256 p = i;
        while (p > 0) {
            unchecked {
                --p;
            }
            bytes1 c = json[p];
            if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) continue;
            return c == 0x7b || c == 0x2c;
        }
        return false;
    }

    function _skipWs(bytes calldata json, uint256 p) private pure returns (uint256) {
        while (p < json.length) {
            bytes1 c = json[p];
            if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) break;
            ++p;
        }
        return p;
    }
}
