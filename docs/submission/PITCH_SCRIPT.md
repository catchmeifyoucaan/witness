# Witness — Pitch Script (≈2 minutes)

Teleprompter text. Speak naturally; aim for **under 2:00** (~280–320 words). Solo founder: **Brendon Parker** (no co-founders).

Recording tip: quiet room, eye-level camera, logo card behind or as first frame. Do not read contract addresses aloud; show them on-screen.

---

Witness. Two minutes.

I'm Brendon Parker — solo founder, GitHub catchmeifyoucaan. This is Witness for Monad Metropolis Track 04: Trust, Identity and AI.

AI is changing identity and provenance, but useful credentials still pile up inside platforms we don't own. If Face ID for on-chain actions wraps your passkey into a hot key, or depends on one company's verifier, we centralized trust again.

Witness is a non-custodial smart account on Monad testnet. Your device passkey — P-256, WebAuthn — is the only authority that can move funds. A throwaway secp256k1 burner pays gas. It is not an owner. The page never unwraps the passkey.

On approve, we bind the exact transfer into a challenge: account, nonce, recipient, value, data, chain id, deadline. Your authenticator signs it. The contract checks user verified, rpId, origin, and challenge, then calls Monad's P256 precompile at 0x0100. Verification happens inside the transaction. The nonce kills replay.

We ship without recovery and without domain migration on purpose. New origin means new passkey and new account. That is the security boundary for this primitive — not a missing consumer-wallet feature.

Why Monad? Native 0x0100 makes WebAuthn verification a protocol building block. We measured gas on Foundry's Monad EVM and send honest limits. The hardened factory is live on testnet.

Who builds on this? Wallets, agent runtimes, and dapps that want Face ID approval without rolling their own WebAuthn stack or trusting a centralized attestor. Origin binding, real-authenticator high-s behavior, and tested precompile use are already in the box.

Ask: run the demo, read the judge access notes, and if you're on Track 04, integrate against our factory — one other team this week is the traction we want. Witness: your device is the key; Monad verifies it on-chain.

