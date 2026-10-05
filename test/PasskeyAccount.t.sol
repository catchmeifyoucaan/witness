// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {PasskeyAccount} from "../src/PasskeyAccount.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";
import {WebAuthn} from "../src/WebAuthn.sol";

/// @notice These tests run with `network = "monad"` in foundry.toml.
/// Foundry's Monad EVM already implements EIP-7951 at 0x0100 and refuses `vm.etch` on that
/// address (`cannot use precompile 0x100 as an argument`). A stand-in that always returns
/// true is therefore neither possible nor wanted: every signature check below hits the real
/// precompile. The fork test repeats the Wycheproof vector and a full `execute` against
/// Monad testnet state, where the same precompile lives.

contract PasskeyAccountTest is Test {
    // Wycheproof / execution-spec-tests EIP-7951 vector H0. A real P-256 signature, not a toy.
    bytes32 internal constant H0 = 0xbb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023;
    uint256 internal constant R0 = 0x2ba3a8be6b94d5ec80a6d9d1190a436effe50d85a1eee859b8cc6af9bd5c2e18;
    uint256 internal constant S0 = 0x4cd60b855d442f5b3c7b11eb6c4e0ae7525fe710fab9aa7c77a67f79e6fadd76;
    uint256 internal constant X0 = 0x2927b10512bae3eddcfe467828128bad2903269919f7086069c8c4df6c732838;
    uint256 internal constant Y0 = 0xc7787964eaac00e5921fb1498a60f4606766b3d9685001558d1a974e7341513e;
    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    string internal constant ORIGIN = "http://localhost:5173";
    string internal constant OTHER_LOCAL = "http://127.0.0.1:5173";
    string internal constant RP_ID = "localhost";

    PasskeyAccountFactory internal factory;

    struct Signed {
        PasskeyAccount account;
        bytes auth;
        bytes client;
        bytes32 hash;
        uint256 r;
        uint256 s;
        uint256 qx;
        uint256 qy;
        address to;
        uint256 value;
        bytes data;
        uint256 deadline;
    }

    function setUp() public {
        factory = new PasskeyAccountFactory();
    }

    function test_b64url32_matches_python() public {
        bytes32[3] memory samples;
        samples[0] = bytes32(0);
        samples[1] = keccak256("witness");
        samples[2] = bytes32(type(uint256).max);
        for (uint256 i; i < samples.length; ++i) {
            string memory mine = string(WebAuthn.b64url32(samples[i]));
            string memory theirs = _pyB64(samples[i]);
            assertEq(mine, theirs, "base64url diverges from Python");
        }
    }

    function test_wycheproof_vector_is_a_real_signature() public {
        string memory out = _trimNl(_ffi(3, "script/check_wycheproof.py", "", "", ""));
        assertEq(out, "ok python-accepts-high-s");
    }

    function test_real_precompile_accepts_wycheproof_and_rejects_garbage() public view {
        assertEq(_staticP256(H0, R0, S0, X0, Y0), abi.encode(uint256(1)));
        assertEq(_staticP256(H0, R0, N - S0, X0, Y0), abi.encode(uint256(1)), "high-s must verify");
        assertEq(_staticP256(H0, R0 + 1, S0, X0, Y0).length, 0, "wrong signature must be empty");
        (bool ok, bytes memory ret) = address(0x100).staticcall(hex"01");
        assertTrue(ok);
        assertEq(ret.length, 0, "short input must be empty");
    }

    function test_factory_predict_matches_create_and_is_idempotent() public {
        address predicted = factory.predict(X0, Y0, RP_ID, ORIGIN, true);
        uint256 beforeCreate = gasleft();
        address created = factory.createAccount(X0, Y0, RP_ID, ORIGIN, true);
        uint256 createGas = beforeCreate - gasleft();
        console2.log("GAS_CREATE_INTERNAL", createGas);
        assertLt(21_000 + 20_000 + createGas, 1_600_000, "raise CREATE_GAS_LIMIT");
        assertEq(predicted, created);
        assertEq(factory.createAccount(X0, Y0, RP_ID, ORIGIN, true), created);
        PasskeyAccount account = PasskeyAccount(payable(created));
        assertEq(account.qx(), X0);
        assertEq(account.rpId(), RP_ID);
        assertEq(account.allowLocalDevOrigins(), true);
    }

    function test_execute_transfers_mon_and_records_gas() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        vm.deal(address(w.account), 2 ether);
        uint256 bobBefore = address(0xBEEF).balance;

        bytes memory cd =
            abi.encodeCall(PasskeyAccount.execute, (w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s));
        uint256 cdGas = _calldataGas(cd);

        uint256 mockGas = _measurePrecompile(abi.encodePacked(w.hash, w.r, w.s, w.qx, w.qy));
        uint256 before = gasleft();
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s);
        uint256 exec = before - gasleft();

        assertEq(address(0xBEEF).balance - bobBefore, 1 ether);
        assertEq(address(w.account).balance, 1 ether);
        assertEq(w.account.nonce(), 1);

        // `mockGas` is a direct staticcall to the real precompile (6900 plus CALL overhead).
        // `exec` already includes that cost. The recommended figure is a transaction gas limit:
        // intrinsic + calldata + the measured call, plus a fixed cushion for a cold account.
        uint256 recommended = 21_000 + cdGas + exec + 25_000;
        console2.log("GAS_EXECUTE_INTERNAL", exec);
        console2.log("GAS_PRECOMPILE_STATICCALL", mockGas);
        console2.log("GAS_CALLDATA", cdGas);
        console2.log("GAS_RECOMMENDED_TX_LIMIT", recommended);
        // src/limits.ts EXECUTE_GAS_LIMIT. Monad bills the limit.
        assertLt(recommended, 480_000, "measured execute budget exceeded 480000; raise the client gas limit");
    }

    function test_attached_value_can_fund_and_forward() public {
        vm.deal(address(this), 10 ether);
        Signed memory w = _signed(address(0xBEEF), 0.4 ether, hex"", 1_700_000_000 + 3600);
        w.account.execute{value: 1 ether}(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s);
        assertEq(address(0xBEEF).balance, 0.4 ether);
        assertEq(address(w.account).balance, 0.6 ether);
    }

    function test_replay_is_rejected() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        vm.deal(address(w.account), 3 ether);
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s);
        vm.expectRevert(WebAuthn.ChallengeMismatch.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s);
        assertEq(w.account.nonce(), 1);
        assertEq(address(0xBEEF).balance, 1 ether);
    }

    function test_wrong_signature_is_rejected() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        vm.deal(address(w.account), 2 ether);
        vm.expectRevert(WebAuthn.SignatureInvalid.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r + 1, w.s);
        assertEq(w.account.nonce(), 0);
        assertEq(address(0xBEEF).balance, 0);
    }

    function test_wrong_amount_is_a_challenge_mismatch() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        vm.deal(address(w.account), 3 ether);
        vm.expectRevert(WebAuthn.ChallengeMismatch.selector);
        w.account.execute(w.to, w.value + 1, w.data, w.deadline, w.auth, w.client, w.r, w.s);
    }

    function test_expired_deadline_is_rejected() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        vm.deal(address(w.account), 2 ether);
        vm.warp(w.deadline + 1);
        vm.expectRevert(PasskeyAccount.Expired.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s);
    }

    function test_user_present_and_verified_flags() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        bytes memory noUp = w.auth;
        noUp[32] = 0x00;
        vm.expectRevert(WebAuthn.UserNotPresent.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, noUp, w.client, w.r, w.s);

        bytes memory noUv = w.auth;
        noUv[32] = 0x01;
        vm.expectRevert(WebAuthn.UserNotVerified.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, noUv, w.client, w.r, w.s);
    }

    function test_rp_id_mismatch() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        bytes memory bad = w.auth;
        bad[0] = bytes1(uint8(bad[0]) ^ 0x01);
        vm.expectRevert(WebAuthn.RpIdMismatch.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, bad, w.client, w.r, w.s);
    }

    function test_origin_rules() public {
        Signed memory open = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        bytes memory evil = _swapOrigin(open.client, ORIGIN, "http://evil.example:1");
        vm.expectRevert(WebAuthn.OriginMismatch.selector);
        open.account.execute(open.to, open.value, open.data, open.deadline, open.auth, evil, open.r, open.s);

        // Same length, so this is a pure origin splice. The other local origin is allowed,
        // and the failure is the signature, because the signed bytes changed.
        bytes memory other = _swapOrigin(open.client, ORIGIN, OTHER_LOCAL);
        vm.expectRevert(WebAuthn.SignatureInvalid.selector);
        open.account.execute(open.to, open.value, open.data, open.deadline, open.auth, other, open.r, open.s);

        Signed memory locked = _signedWith(false, address(0xCAFE), 1 ether, hex"", 1_700_000_000 + 3600);
        bytes memory blocked = _swapOrigin(locked.client, ORIGIN, OTHER_LOCAL);
        vm.expectRevert(WebAuthn.OriginMismatch.selector);
        locked.account
            .execute(locked.to, locked.value, locked.data, locked.deadline, locked.auth, blocked, locked.r, locked.s);
    }

    function test_type_must_be_get() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        bytes memory created = _swap(w.client, "webauthn.get", "webauthn.out");
        vm.expectRevert(WebAuthn.BadClientDataType.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, created, w.r, w.s);
    }


    function test_cross_origin_true_is_rejected_before_the_signature() public {
        Signed memory w = _signed(address(0xBEEF), 1 ether, hex"", 1_700_000_000 + 3600);
        // Same length as "false", so this is a pure policy splice. The check runs before P256.
        bytes memory crossed = _swap(w.client, "false", "true ");
        vm.expectRevert(WebAuthn.CrossOrigin.selector);
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, crossed, w.r, w.s);
    }

    function test_challenge_view_matches_binding() public {
        address created = factory.createAccount(X0, Y0, RP_ID, ORIGIN, true);
        PasskeyAccount account = PasskeyAccount(payable(created));
        uint256 deadline = 123;
        bytes32 got = account.challengeFor(address(0xBEEF), 1 ether, hex"abcd", deadline);
        bytes32 expected = keccak256(
            abi.encode(
                address(account),
                uint256(0),
                address(0xBEEF),
                uint256(1 ether),
                bytes(hex"abcd"),
                block.chainid,
                deadline
            )
        );
        assertEq(got, expected);
    }

    function test_fork_real_precompile_and_execute() public {
        uint256 forkId;
        try this._fork() returns (uint256 id) {
            forkId = id;
        } catch {
            console2.log(
                "SKIP: Monad testnet fork unavailable. createFork reverted, so testnet state was not reached. Local Monad EVM tests still call the real 0x0100 precompile. RPC: https://testnet-rpc.monad.xyz"
            );
            return;
        }
        vm.selectFork(forkId);
        assertEq(block.chainid, 10143, "fork is not Monad testnet");
        // setUp deployed the factory on the local EVM. Fork state does not have it.
        factory = new PasskeyAccountFactory();

        bytes memory okRet = _staticP256(H0, R0, S0, X0, Y0);
        assertEq(okRet, abi.encode(uint256(1)), "real precompile rejected the Wycheproof vector");
        assertEq(_staticP256(H0, R0, N - S0, X0, Y0), abi.encode(uint256(1)), "real precompile rejected high-s");
        assertEq(_staticP256(H0, R0 + 1, S0, X0, Y0).length, 0, "real precompile accepted a bad signature");

        // Full account path, no mock. The signature is fresh and cryptography already checked it.
        Signed memory w = _signedNoMock(address(0xBEEF), 1 ether, hex"", block.timestamp + 600);
        vm.deal(address(w.account), 2 ether);
        bytes memory cd =
            abi.encodeCall(PasskeyAccount.execute, (w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s));
        uint256 bobBefore = w.to.balance;
        uint256 before = gasleft();
        w.account.execute(w.to, w.value, w.data, w.deadline, w.auth, w.client, w.r, w.s);
        uint256 exec = before - gasleft();
        assertEq(w.to.balance - bobBefore, 1 ether);
        assertEq(address(w.account).balance, 1 ether);
        assertEq(w.account.nonce(), 1);
        console2.log("GAS_FORK_EXECUTE_INTERNAL", exec);
        console2.log("GAS_FORK_CALLDATA", _calldataGas(cd));
        console2.log("GAS_FORK_RECOMMENDED_TX_LIMIT", 21_000 + _calldataGas(cd) + exec + 25_000);
        console2.log("FORK: real 0x0100 accepted the passkey assertion and the Wycheproof vector, including high-s");
    }

    function _fork() external returns (uint256) {
        return vm.createFork("monad_testnet");
    }

    function _signed(address to, uint256 value, bytes memory data, uint256 deadline)
        internal
        returns (Signed memory w)
    {
        vm.warp(1_700_000_000);
        w = _signedNoMock(to, value, data, deadline);
    }

    function _signedWith(bool allowLocal, address to, uint256 value, bytes memory data, uint256 deadline)
        internal
        returns (Signed memory w)
    {
        vm.warp(1_700_000_000);
        w = _materialize(allowLocal, to, value, data, deadline);
    }

    function _signedNoMock(address to, uint256 value, bytes memory data, uint256 deadline)
        internal
        returns (Signed memory w)
    {
        w = _materialize(true, to, value, data, deadline);
    }

    function _materialize(bool allowLocal, address to, uint256 value, bytes memory data, uint256 deadline)
        internal
        returns (Signed memory w)
    {
        string memory keyJson = _ffi(3, "script/gen_key.py", "", "", "");
        uint256 priv = vm.parseJsonUint(keyJson, ".d");
        uint256 qx = vm.parseJsonUint(keyJson, ".qx");
        uint256 qy = vm.parseJsonUint(keyJson, ".qy");

        address predicted = factory.predict(qx, qy, RP_ID, ORIGIN, allowLocal);
        PasskeyAccount account = PasskeyAccount(payable(predicted));
        bytes32 challenge = keccak256(abi.encode(predicted, uint256(0), to, value, data, block.chainid, deadline));

        string memory signedJson = _sign(priv, challenge);

        w.account = PasskeyAccount(payable(factory.createAccount(qx, qy, RP_ID, ORIGIN, allowLocal)));
        assertEq(address(w.account), predicted);
        w.auth = vm.parseJsonBytes(signedJson, ".authenticatorData");
        w.client = vm.parseJsonBytes(signedJson, ".clientDataJSON");
        w.hash = vm.parseJsonBytes32(signedJson, ".hash");
        w.r = vm.parseJsonUint(signedJson, ".r");
        w.s = vm.parseJsonUint(signedJson, ".s");
        w.qx = qx;
        w.qy = qy;
        w.to = to;
        w.value = value;
        w.data = data;
        w.deadline = deadline;

        assertEq(WebAuthn.messageHash(w.auth, w.client), w.hash, "Solidity digest != Python digest");
        assertEq(account.challengeFor(to, value, data, deadline), challenge);
    }

    function _sign(uint256 priv, bytes32 challenge) internal returns (string memory) {
        string[] memory cmd = new string[](7);
        cmd[0] = "bash";
        cmd[1] = "script/python.sh";
        cmd[2] = "script/sign_webauthn.py";
        cmd[3] = vm.toString(priv);
        cmd[4] = vm.toString(challenge);
        cmd[5] = ORIGIN;
        cmd[6] = RP_ID;
        return string(vm.ffi(cmd));
    }

    function _ffi(uint256 n, string memory script, string memory a, string memory b, string memory c)
        internal
        returns (string memory)
    {
        string[] memory cmd = new string[](n);
        cmd[0] = "bash";
        cmd[1] = "script/python.sh";
        cmd[2] = script;
        if (n > 3) cmd[3] = a;
        if (n > 4) cmd[4] = b;
        if (n > 5) cmd[5] = c;
        return string(vm.ffi(cmd));
    }

    function _pyB64(bytes32 word) internal returns (string memory) {
        string[] memory cmd = new string[](4);
        cmd[0] = "bash";
        cmd[1] = "script/python.sh";
        cmd[2] = "script/b64url32.py";
        cmd[3] = vm.toString(word);
        return string(vm.ffi(cmd));
    }

    function _staticP256(bytes32 h, uint256 r, uint256 s, uint256 x, uint256 y) internal view returns (bytes memory) {
        (bool ok, bytes memory ret) = address(0x100).staticcall(abi.encodePacked(h, r, s, x, y));
        assertTrue(ok, "precompile staticcall reverted");
        return ret;
    }

    function _measurePrecompile(bytes memory input) internal view returns (uint256) {
        uint256 before = gasleft();
        (bool ok,) = address(0x100).staticcall(input);
        uint256 used = before - gasleft();
        assertTrue(ok);
        return used;
    }

    function _calldataGas(bytes memory cd) internal pure returns (uint256 g) {
        for (uint256 i; i < cd.length; ++i) {
            g += cd[i] == 0 ? 4 : 16;
        }
    }

    function _swapOrigin(bytes memory blob, string memory from, string memory to) internal pure returns (bytes memory) {
        return _swap(blob, bytes(from), bytes(to));
    }

    function _swap(bytes memory blob, bytes memory from, bytes memory to) internal pure returns (bytes memory) {
        require(from.length == to.length, "swap length");
        bytes memory out = new bytes(blob.length);
        for (uint256 i; i < blob.length; ++i) {
            out[i] = blob[i];
        }
        for (uint256 i; i + from.length <= out.length; ++i) {
            bool eq = true;
            for (uint256 j; j < from.length; ++j) {
                if (out[i + j] != from[j]) {
                    eq = false;
                    break;
                }
            }
            if (!eq) continue;
            for (uint256 j; j < to.length; ++j) {
                out[i + j] = to[j];
            }
            return out;
        }
        revert("pattern missing");
    }

    function _trimNl(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 n = b.length;
        while (n > 0 && (b[n - 1] == 0x0a || b[n - 1] == 0x0d)) {
            unchecked {
                --n;
            }
        }
        bytes memory o = new bytes(n);
        for (uint256 i; i < n; ++i) {
            o[i] = b[i];
        }
        return string(o);
    }
}
