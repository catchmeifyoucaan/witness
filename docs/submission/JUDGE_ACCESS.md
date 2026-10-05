# Witness â€” Judge Access Instructions

**For:** `metropolis@hackathon.monad.xyz`  
**Repo:** https://github.com/catchmeifyoucaan/witness  
**Track:** Trust, Identity & AI (Metropolis Track 04)  
**Chain:** Monad Testnet (chain id `10143`)  
**RPC:** https://testnet-rpc.monad.xyz  
**Explorer:** https://testnet.monadvision.com  

Witness has **no test login credentials**. Auth is a device passkey (WebAuthn / P-256). The page never unwraps that key. A disposable secp256k1 burner only pays gas.

---

## What is already live on Monad testnet

| Item | Address / value |
| --- | --- |
| Hardened factory | [`0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc`](https://testnet.monadvision.com/address/0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc) |
| Demo passkey account | [`0xf9f166fac6f1d591cb0c4438ef8334fbb4af968d`](https://testnet.monadvision.com/address/0xf9f166fac6f1d591cb0c4438ef8334fbb4af968d) |
| Gas payer used in the recorded demo | [`0x993056C6B440AabB051024e87d858f9289437877`](https://testnet.monadvision.com/address/0x993056C6B440AabB051024e87d858f9289437877) |

**Sample `execute` / settle transactions (open on MonadVision):**

- https://testnet.monadvision.com/tx/0x2eaf35ffe76cab6b68c757a597896561931e26bab08f06fbde05b2b5417ce866
- https://testnet.monadvision.com/tx/0xd745b5aeae194471f5af20b39c12b99832300bb55276f911a3b8f5811b6d0bd6

On-chain verification uses Monadâ€™s P256 precompile at `0x0100` (EIP-7951). The factory and account code are in this repository under `src/`.

---

## Live product link (UI)

### Option A â€” local demo (recommended, full control)

WebAuthn requires `http://localhost` or `https`. **`127.0.0.1` is a different origin.** A passkey created on one will not assert on the other.

```bash
git clone https://github.com/catchmeifyoucaan/witness.git
cd witness
npm install
npm run dev
```

Open **exactly**:

```text
http://localhost:5173/
```

Do **not** use `http://127.0.0.1:5173/`.

### Option B â€” hosted static UI (if enabled)

If GitHub Pages (or another static host) is configured for this repo, use the URL listed in the Metropolis profile / README â€œLive Product Linkâ€ section.

**Origin warning (critical):** Creating a passkey on a hosted hostname (for example `https://catchmeifyoucaan.github.io`) binds `rpId` and origin to that host. That creates a **different** account than one created on `http://localhost:5173`. There is **no recovery and no domain migration** by design. New origin = new passkey + new account. Paste the same factory address either way; the CREATE2 salt includes hostname/origin.

---

## Hardware / browser requirements

- Prefer a **phone** (Face ID / fingerprint) or a **hardware security key**.
- Use **Chrome** or **Edge**. Avoid browsers that break WebAuthn (for example some AI sidebars / Comet-style browsers).
- **Windows Hello** often fails or is flaky for this ceremony â€” if create/get fails, switch to a phone or security key.
- You need a small amount of **testnet MON** for gas and to fund the account.

---

## Gas and funding

1. Open the page at `http://localhost:5173/`.
2. Note the **gas payer** address shown on the page (a page-local burner in `localStorage`, not an owner).
3. Fund that address from the faucet: https://faucet.monad.xyz  
4. Paste factory `0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc` if not already filled.
5. Create a passkey â†’ Deploy account â†’ Fund the account with MON â†’ Approve a small transfer with the passkey.
6. Open the explorer link the UI prints (or the sample txs above).

Gas limits the client sends (Monad bills `gas_limit * price`):

| Action | Limit |
| --- | --- |
| `execute` | 480,000 |
| `createAccount` | 1,600,000 |
| Fund transfer | 60,000 |

Keep **one** gas payer funded; you do not need a separate â€œloginâ€ wallet.

---

## Credentials

**None.** There is no shared judge password. The passkey is the authenticator. If you cannot complete WebAuthn on your machine, verify the contracts and the sample transactions on MonadVision instead, then run the UI on a device that supports platform passkeys.

---

## What to expect in a successful run

1. Passkey create prompt from the OS / phone.
2. Account address predicted/deployed via factory CREATE2.
3. Funding tx into the account (no passkey).
4. Passkey assert on transfer â†’ status lines show challenge binding â†’ explorer receipt for `execute`.
5. Replay of the same approval fails (nonce consumed on-chain).

Questions about the primitive (not end-user support): see `docs/submission/WRITEUP.md` and the root `README.md`.

