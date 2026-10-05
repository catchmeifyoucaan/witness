# Hosting a Live Product Link (GitHub Pages)

Judges prefer a URL they can open. Witness UI is a static Vite app, but **WebAuthn binds to origin**.

## Critical warning

| Origin | Effect |
| --- | --- |
| `http://localhost:5173` | Passkeys + accounts created here only work here |
| `https://<user>.github.io/witness` | Different rpId/origin → **new** passkey + **new** account |
| `127.0.0.1` | Different from `localhost` — do not mix |

There is **no** domain migration. Document whichever origin you submit.

## Enable gh-pages (from a machine with `gh` auth)

```bash
git clone https://github.com/catchmeifyoucaan/witness.git
cd witness
npm install
# set base for project pages:
# in vite.config.ts add:  base: '/witness/',
npm run build
# deploy dist/ to gh-pages branch (example with gh-pages package):
npm install -D gh-pages
npx gh-pages -d dist
```

Then in GitHub → Settings → Pages → Deploy from branch `gh-pages` / root.

**Expected URL:** `https://catchmeifyoucaan.github.io/witness/`

Update Metropolis “Live Product Link” and `JUDGE_ACCESS.md` Option B with that URL. Tell judges: creating a passkey on Pages creates a **different** account than localhost; factory address stays the same.

## Alternative: Vercel / Netlify

Same origin warning. Set build `npm run build`, output `dist`, and use `base: '/'` if the app is at domain root.

## Box note

`gh auth` is **not** logged in on the shared build box. Hosting must be run from Brendon’s machine (`catchmeifyoucaan`) or after `gh auth login`.
