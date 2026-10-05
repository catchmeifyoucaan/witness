# Witness — Demo Video Shot List (≤3 minutes)

**Goal:** Live product only. No slides. No code walkthrough. No Comet / Perplexity / AI browser sidebars.  
**Browser:** Microsoft Edge or Google Chrome.  
**URL:** `http://localhost:5173/` (never `127.0.0.1`)  
**Max length:** 3:00. Target **2:00–2:40**.

Before record: fund the gas payer from https://faucet.monad.xyz ; have factory `0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc` ready to paste; clear clutter from the desktop; hide bookmarks bar if needed; use a phone or security key (Windows Hello may fail).

---

## Timeline

| Time | Shot | Action / narration |
| --- | --- | --- |
| 0:00–0:10 | Title card (optional, ≤5s) then browser | “Witness — passkey smart account on Monad testnet.” Open `http://localhost:5173/`. |
| 0:10–0:25 | Gas payer panel | Point to burner address. “This key only pays gas. It is not the owner.” |
| 0:25–0:50 | Create passkey | Click create. Complete Face ID / fingerprint / security key on camera if possible. “Device passkey is the authority.” |
| 0:50–1:15 | Deploy | Paste factory if needed → Deploy. Pause on predicted/deployed account address. |
| 1:15–1:35 | Fund | Send a small amount of MON into the account. Show status / tx hash briefly. |
| 1:35–2:15 | Approve transfer | Enter recipient + tiny amount → Approve with passkey. **Pause 3–4 seconds** on status lines (challenge / verify / submitted). |
| 2:15–2:45 | Explorer | Open MonadVision receipt for the `execute` tx (new tab). Scroll to show success. Optional: flash one prior sample tx. |
| 2:45–3:00 | Close | Back to UI. One line: “No seed phrase. Monad `0x0100` verifies on-chain.” End. |

---

## Must show on camera

- [ ] `localhost:5173` in the address bar  
- [ ] Passkey ceremony (OS / phone prompt)  
- [ ] Deployed account address  
- [ ] Successful approve / status lines  
- [ ] Explorer receipt (MonadVision)  

## Must not show

- [ ] `.env`, private keys, or “reveal key” longer than needed  
- [ ] Slides, Figma, or IDE as the main content  
- [ ] Failed Windows Hello loops — cut and re-take with phone/key  
- [ ] Mainnet claims  

## Backup if WebAuthn fails mid-take

Cut to explorer: account `0xf9f166fa…968d` and txs  
`0x2eaf35ffe76cab6b…` / `0xd745b5aeae194471…`, then retry create/approve on a working device in a second take. Prefer one continuous successful take.
