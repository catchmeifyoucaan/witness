# Witness

A passkey account for Monad. Face ID, Touch ID, or Windows Hello approves a MON transfer. The P256 precompile at `0x0100` checks that signature **inside the transaction**. The page never unwraps the passkey into a secp256k1 hot key. There is no seed phrase.

Track: Trust, Identity and AI.

Witness is a non-custodial, single-authenticator smart account whose authorization is bound to a WebAuthn origin and deployment identity. The hardened factory rejects cross-origin ceremonies, and the client prevents duplicate same-nonce submissions. The prototype intentionally has no recovery or domain migration.

Hardened factory on Monad testnet: `0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc`.

**Judges / DX package:** [docs/submission/JUDGE_ACCESS.md](docs/submission/JUDGE_ACCESS.md) · [WRITEUP](docs/submission/WRITEUP.md) · [checklist](docs/submission/METROPOLIS_CHECKLIST.md)


## What is on-chain, and what is only a ceremony

| | Where it lives | What it can do |
| --- | --- | --- |
| Platform passkey (P-256) | The authenticator. The page never sees the private key. | Signs one WebAuthn assertion per approval. |
| `PasskeyAccount` | A contract deployed through the factory. | Holds MON. Moves it only if the assertion verifies. |
| Burner / relayer | A secp256k1 key in `localStorage`, generated in the page. | Pays gas and submits `execute`. It is not an owner. It is not derived from the passkey. |
| Browser | WebAuthn `create` / `get`, plus viem. | Builds the ceremony and posts the transaction. It is not the authority. |

This is not an EIP-7702 delegation. A delegated EOA on Monad cannot be drawn below a 10 MON reserve. Witness is an ordinary contract. The passkey authorizes it. Any EOA can post the transaction.

## The check

`execute` binds the approval to this exact transfer:

```text
challenge = keccak256(abi.encode(account, nonce, to, value, data, chainid, deadline))
```

The browser asks the authenticator to sign those 32 bytes. `clientDataJSON` carries them as unpadded base64url. The contract, not JavaScript, then checks:

1. Authenticator flags: user present (bit 0) and user verified (bit 2).
2. `authenticatorData[0:32]` equals `sha256(rpId)`. `rpId` is the hostname stored at deployment.
3. `clientDataJSON` type is `webauthn.get`.
4. Origin equals the origin stored at deployment. If the account was created with `allowLocalDevOrigins`, `http://localhost:5173` and `http://127.0.0.1:5173` are also accepted. No production hostname is hardcoded.
5. The challenge field is the base64url of the digest above. Padding `=` is tolerated; a different challenge is not.
6. `sha256(authenticatorData || sha256(clientDataJSON))` is handed to `P256.verify`, which `staticcall`s `0x0100`.

The nonce increments before the call, so the recipient cannot replay the approval. A second copy of the same transaction fails the challenge check.

### P256 precompile

Confirmed against [Monad's precompile docs](https://docs.monad.xyz/developer-essentials/precompiles) and a live `eth_call` to testnet `0x0100` on 2026-10-04:

- Address `0x0100`, EIP-7951, gas 6900.
- Input is exactly 160 bytes: `hash || r || s || qx || qy`, each a 32-byte big-endian word.
- The precompile does not hash again. `hash` is already the ES256 digest.
- Success returns 32-byte `1`. Failure, including a short input, returns empty data.

### High-s is accepted on purpose

EIP-7951's equation treats `(r, n − s)` as valid. The same live call returned `1` for both `s` and `n − s` of the Wycheproof vector used in the tests (`n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551`). WebAuthn authenticators do not force `s` into the lower half. Rejecting high-s would fail about half of genuine Face ID approvals. A flipped `s` is a second encoding of the same approval; the nonce consumes it on first inclusion.

## Gas limit

Monad charges `gas_limit * price`, not gas used. See [gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing) and [differences](https://docs.monad.xyz/developer-essentials/differences). Witness sets the limit in the client and does not call `eth_estimateGas`.

Measured with `forge test -vv` on Foundry's Monad EVM (`network = "monad"` in `foundry.toml`), which prices the real precompile:

| | Gas |
| --- | --- |
| `execute` internal call, real `0x0100` | 272,043 |
| Direct precompile staticcall | 7,273 |
| Calldata cost of that `execute` | 5,356 |
| Recommended transaction floor (`21000 + calldata + internal + 25000`) | 323,399 |
| **Limit the page actually sends** | **480,000** |
| `createAccount` internal call | 1,081,512 |
| **Limit the page sends for deployment** | **1,600,000** |
| Funding transfer into the account | **60,000** |

A fork of Monad testnet measured the same `execute` at 237,011 internal gas (recommended floor 288,379). The page uses the higher local figure.

480,000 covers the crossOrigin check plus a longer browser `clientDataJSON`. At the minimum base fee of 100 MON-gwei, 480,000 gas costs 0.048 MON. Failed calls can still consume significant gas, so the page simulates before broadcast.

The factory deployment script should be broadcast with `--gas-limit 1600000`.

## Chains

| | Chain id | RPC |
| --- | --- | --- |
| Monad testnet (the demo) | 10143 | `https://testnet-rpc.monad.xyz` |
| Monad mainnet | 143 | not targeted by this build |
| Local Anvil, if you run one | 31337 | `http://127.0.0.1:8545` |

The page defaults to testnet. The network switch also offers local Anvil. It does not offer a one-click mainnet send. Nothing in this repository was deployed to mainnet.

**Hardened factory (Monad testnet):** [`0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc`](https://testnet.monadvision.com/address/0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc)

Faucet: <https://faucet.monad.xyz>. Explorer: <https://testnet.monadvision.com>.

Judge access, pitch, and demo package: [`docs/submission/`](docs/submission/JUDGE_ACCESS.md).

## Run the page

WebAuthn requires `http://localhost` or `https`. `127.0.0.1` is a different hostname: a passkey created on one will not assert on the other, because `rpId` is the hostname. The dev server is pinned to port **5173** so the origin stays `http://localhost:5173`.

```bash
cd /workspace/witness
npm install
forge install   # only if lib/forge-std is missing
npm run dev
```

Open <http://localhost:5173>.

1. The page generates a gas-payer key and shows its address. Fund that address from the faucet. The key can be revealed; it is not a passkey secret.
2. Create a passkey. The platform authenticator runs. The page reads the COSE P-256 public key (`-2`, `-3`) from `attestationObject`.
3. Paste the factory address and deploy. The burner pays. The account address comes from CREATE2 over the public key, hostname, and origin.
4. Move MON into the account. That transfer does not need the passkey.
5. Enter a recipient and an amount. Approve with the passkey. The contract reads the nonce into the challenge, the authenticator signs it, and `execute` is sent with gas limit 480,000.

## Deploy the factory

```bash
forge script script/Deploy.s.sol \
  --rpc-url monad_testnet \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --gas-limit 1600000
```

`PRIVATE_KEY` is the gas payer, not a passkey. Paste the logged factory address into the page. The same command against `http://127.0.0.1:8545` deploys to Anvil; switch the page to Local Anvil.

`foundry.toml` sets `network = "monad"` so Forge, the script simulator, and the tests use Monad's precompiles and gas. That matches [Foundry on Monad](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry). Do not drop that setting: `vm.etch` cannot replace `0x0100` once the Monad precompile is installed, and the tests depend on the real one.

## Tests

```bash
npm test          # forge test
forge test -vv    # same, with the gas logs
npm run build
```

`forge test` needs the project virtualenv the first time you are off this machine:

```bash
python3 -m venv .venv
.venv/bin/pip install cryptography
```

`script/python.sh` uses `.venv` when it is present. The Python path does two things the precompile cannot do alone: it proves the Wycheproof vector is a real P-256 signature under `cryptography`, and it builds the synthetic WebAuthn assertion whose digest the Solidity hasher must match byte for byte.

What the suite covers:

- Real `0x0100` on the local Monad EVM: Wycheproof vector, high-s, a wrong signature, a short input.
- A full `execute` whose signature was produced and self-checked by Python, then accepted by the precompile. MON moves. Nonce becomes 1.
- Replay, wrong `r`, wrong amount, expired deadline, missing UP, missing UV, wrong rpId, wrong type, evil origin.
- Local-origin allowlist on, and the same splice rejected when the allowlist is off.
- Factory `predict` equals the CREATE2 address, and a second create returns the same account.
- A fork of Monad testnet (chain id 10143) repeats the Wycheproof vector and a full `execute` against testnet's precompile. If `createFork` reverts, that test logs `SKIP:` and the rest of the suite still passes.

Foundry refuses to etch a mock over `0x0100` on the Monad EVM (`cannot use precompile 0x100 as an argument`). The tests call the real precompile instead of a stub that returns true.

## What this build does not claim

- No mainnet deployment.
- No recovery and no domain migration. **New origin = new passkey + new account.**
- `signCount` is not enforced. Several platform authenticators keep it at zero. Replay protection is the nonce.
- This is a protocol primitive demo, not a production consumer wallet.

## Developer quick reference

| | |
| --- | --- |
| Factory (testnet) | `0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc` |
| Challenge | `keccak256(abi.encode(account, nonce, to, value, data, chainid, deadline))` |
| `EXECUTE` gas limit | `480000` |
| `CREATE` gas limit | `1600000` |
| `FUND` gas limit | `60000` |
| P256 precompile | `0x0100` (EIP-7951) |
| Dev origin | **`http://localhost:5173/`** only (not `127.0.0.1`) |
| Origin binding | Hostname + origin fixed at deployment; factory rejects cross-origin ceremonies |

Sample demo account: [`0xf9f166fac6f1d591cb0c4438ef8334fbb4af968d`](https://testnet.monadvision.com/address/0xf9f166fac6f1d591cb0c4438ef8334fbb4af968d)

Sample settle txs:

- [`0x2eaf35ffe76cab6b…ce866`](https://testnet.monadvision.com/tx/0x2eaf35ffe76cab6b68c757a597896561931e26bab08f06fbde05b2b5417ce866)
- [`0xd745b5aeae194471…0bd6`](https://testnet.monadvision.com/tx/0xd745b5aeae194471f5af20b39c12b99832300bb55276f911a3b8f5811b6d0bd6)

Metropolis judges: start at [`docs/submission/JUDGE_ACCESS.md`](docs/submission/JUDGE_ACCESS.md).
