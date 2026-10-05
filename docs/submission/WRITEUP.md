# Witness — Metropolis Project Write-up

**Track:** Trust, Identity & AI  
**Founder:** Brendon Parker (solo) — GitHub [@catchmeifyoucaan](https://github.com/catchmeifyoucaan)  
**Repo:** https://github.com/catchmeifyoucaan/witness

## Problem

AI products are forcing a sharper question about identity and provenance: who authorized this action, and can that proof move without living inside one platform’s account system? Most “passkey wallets” still end up wrapping device credentials into a custodial or app-specific key path, or they stay off-chain ceremony theater. Builders who want Face ID / Touch ID authorization on Monad either invent fragile verification, or they centralize attestation in a service they control. That recreates the capture problem the track is trying to avoid.

## Solution

Witness is a **non-custodial smart-account primitive** for Monad: a device passkey (P-256 / WebAuthn) is the only authority that can move funds from a `PasskeyAccount`. A disposable secp256k1 burner pays gas and submits transactions; it is not an owner and is not derived from the passkey. On approval, the client binds `account, nonce, to, value, data, chainid, deadline` into a challenge. The authenticator signs that challenge. The contract—not JavaScript—checks user presence / user verified flags, rpId hash, origin, challenge encoding, then calls Monad’s P256 precompile at `0x0100` to verify the ES256 digest. The nonce increments before the call, so the approval cannot be replayed.

The hardened factory stores deployment hostname and origin into the account. Cross-origin ceremonies are rejected. The prototype is intentionally **single-authenticator**: there is no recovery flow and no domain migration. New origin equals new passkey and new account. That constraint is the product of a security choice for a hackathon-scale primitive, not an unfinished checkbox.

## Why Monad

Monad ships a native P256 / EIP-7951 precompile. That makes on-chain WebAuthn verification a first-class path instead of a heavy pair of EC libraries or an off-chain verifier. Witness measures gas against Foundry’s Monad EVM (`network = "monad"`) and sends explicit limits (`EXECUTE` 480000, `CREATE` 1600000, `FUND` 60000) because Monad charges `gas_limit * price`. The demo is on Monad testnet (chain id 10143); factory `0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc`.

## What this is not

Witness is not a production-ready consumer wallet, not EIP-7702 delegation, not a social-recovery vault, and not a multi-device key sync product. It is infrastructure other applications can call: factory + account + challenge binding + verified `execute`.

## Who adopts it

Wallets and agent runtimes that want “approve with Face ID” without wrapping the passkey into a secp256k1 hot key; dapps that need origin-bound authorization for high-sensitivity actions; teams building proof-of-control / personhood-adjacent flows on existing hardware without a centralized issuer. They choose Witness over rolling their own because the hard parts—WebAuthn parsing, origin/rpId binding, high-s acceptance matching real authenticators, and correct `0x0100` usage—are already encoded and tested against the real precompile.

## Post-hack plan

Publish a thin TypeScript SDK (predict address, encode challenge, submit `execute`), keep the factory address stable on testnet, invite one other Metropolis team to integrate a “passkey approve” button against the same factory, then document a mainnet checklist (remove local-dev origin allowlist, tighten gas, independent audit). Traction metric for the next thirty days: one external integration PR or a second origin deploy by another team.
