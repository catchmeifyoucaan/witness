import {
  decodeErrorResult,
  formatEther,
  getAddress,
  hexToBytes,
  isAddress,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { accountAbi, factoryAbi } from "./abi";
import {
  burnerKey,
  clientsFor,
  DEPLOYED_FACTORY,
  factoryStorageKey,
  loadBurner,
  monadTestnet,
  networks,
  replaceBurner,
  type WitnessChain,
} from "./chain";
import { EXECUTE_GAS_LIMIT, CREATE_GAS_LIMIT, FUND_GAS_LIMIT } from "./limits";
import { parseEcdsaSignature } from "./der";
import {
  bytesToBigint,
  fromBase64Url,
  publicKeyFromAttestation,
  toBase64Url,
} from "./webauthn";
import type { PrivateKeyAccount } from "viem/accounts";

const PASSKEY_KEY = "witness.passkey.v1";

const LOCK_PREFIX = "witness.lock.v1.";

function lockKey(account: Address, nonce: bigint): string {
  return `${LOCK_PREFIX}${account.toLowerCase()}.${nonce.toString()}`;
}

const LOCK_TTL_MS = 10 * 60 * 1000;

function readLock(account: Address, nonce: bigint): boolean {
  const raw = localStorage.getItem(lockKey(account, nonce));
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at) || Date.now() - at > LOCK_TTL_MS) {
    localStorage.removeItem(lockKey(account, nonce));
    return false;
  }
  return true;
}

function writeLock(account: Address, nonce: bigint): void {
  localStorage.setItem(lockKey(account, nonce), String(Date.now()));
}

function clearLock(account: Address, nonce: bigint): void {
  localStorage.removeItem(lockKey(account, nonce));
}


type SavedPasskey = {
  credentialId: string;
  qx: string;
  qy: string;
  rpId: string;
  origin: string;
  allowLocal: boolean;
  accounts: Record<string, Address>;
};

const $ = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};

const statusEl = $("status");
const networkEl = $<HTMLSelectElement>("network");
const burnerAddressEl = $("burner-address");
const burnerBalanceEl = $("burner-balance");
const burnerKeyEl = $("burner-key");
const factoryInput = $<HTMLInputElement>("factory");
const factoryVersionEl = $("factory-version");
const migrationEl = $("migration");
const passkeyStatus = $("passkey-status");
const accountStatus = $("account-status");
const accountBalanceEl = $("account-balance");
const nonceEl = $("nonce");
const originEl = $("origin-line");
const gasEl = $("gas-line");
const receiptEl = $("receipt");
const secureEl = $("secure");

let chain: WitnessChain = monadTestnet;
let burner: PrivateKeyAccount = loadBurner();
let passkey: SavedPasskey | null = loadPasskey();

function loadPasskey(): SavedPasskey | null {
  const raw = localStorage.getItem(PASSKEY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedPasskey;
    if (!parsed.qx || !parsed.qy || !parsed.credentialId) return null;
    parsed.accounts ??= {};
    return parsed;
  } catch {
    return null;
  }
}

function savePasskey(next: SavedPasskey | null) {
  passkey = next;
  if (next) localStorage.setItem(PASSKEY_KEY, JSON.stringify(next));
  else localStorage.removeItem(PASSKEY_KEY);
}

function setStatus(message: string, kind: "idle" | "good" | "bad" = "idle") {
  statusEl.dataset.kind = kind;
  statusEl.textContent = message;
}

function clients() {
  return clientsFor(chain, burner);
}

function pageBinding() {
  const origin = location.origin;
  const rpId = location.hostname;
  const allowLocal = rpId === "localhost" || rpId === "127.0.0.1";
  return { origin, rpId, allowLocal };
}

function accountAddress(): Address | undefined {
  return passkey?.accounts[String(chain.id)];
}

function short(value: string): string {
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function explain(error: unknown): string {
  const plain: Record<string, string> = {
    Expired: "That approval expired. Approve the transfer again.",
    ChallengeMismatch: "The passkey signed a different transfer than the one submitted. Approve again.",
    CrossOrigin: "That approval was made in a cross-origin frame. The contract refuses it. Nothing was moved.",
    SignatureInvalid: "The P256 precompile rejected the signature.",
    OriginMismatch: "This page's origin is not one the account accepts.",
    RpIdMismatch: "This passkey belongs to a different hostname.",
    UserNotPresent: "The authenticator did not confirm someone was there.",
    UserNotVerified: "Face ID, Touch ID, or Windows Hello did not verify you.",
    BadClientDataType: "That ceremony was not a passkey approval.",
    BadClientData: "The browser's client data could not be read on-chain.",
    CallFailed: "The account could not pay that address. It may not hold enough MON.",
    BadRecipient: "That recipient is the zero address.",
    BadAuthenticatorData: "The authenticator data was the wrong shape.",
  };
  const data = errorData(error);
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: accountAbi, data });
      return plain[decoded.errorName] ?? decoded.errorName;
    } catch {
      /* not one of our errors */
    }
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "The passkey prompt was dismissed.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function errorData(error: unknown): Hex | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { data?: unknown; cause?: unknown };
  if (typeof record.data === "string" && record.data.startsWith("0x")) return record.data as Hex;
  if (record.cause) return errorData(record.cause);
  return undefined;
}

async function feeFields() {
  const { publicClient } = clients();
  const block = await publicClient.getBlock();
  const base = block.baseFeePerGas ?? 100_000_000_000n;
  const maxPriorityFeePerGas = 1_000_000_000n;
  return { maxFeePerGas: base * 2n + maxPriorityFeePerGas, maxPriorityFeePerGas };
}

function render() {
  const binding = pageBinding();
  originEl.textContent = `This page is ${binding.origin}. The passkey is bound to ${binding.rpId}. ${
    binding.allowLocal
      ? "Local demo origins http://localhost:5173 and http://127.0.0.1:5173 are both accepted, but a passkey created on one hostname will not assert on the other."
      : "Local demo origins are not accepted for this host."
  }`;
  gasEl.textContent = `Approval transactions use a fixed ${EXECUTE_GAS_LIMIT.toLocaleString("en-US")} gas limit. Failed calls can still consume significant gas, so Witness simulates before broadcast.`;

  burnerAddressEl.textContent = burner.address;
  burnerKeyEl.textContent = "Hidden. Open the disclosure below to copy the testnet gas-payer key.";
  networkEl.value = String(chain.id);

  const deployed = DEPLOYED_FACTORY[chain.id] ?? "";
  const previous = "0x99F13Ce2452F4B2943bF27e4C893ee63F94B59b3";
  let storedFactory = localStorage.getItem(factoryStorageKey(chain.id)) ?? "";
  if (storedFactory === "" || storedFactory.toLowerCase() === previous.toLowerCase()) {
    storedFactory = deployed;
  }
  if (document.activeElement !== factoryInput) factoryInput.value = storedFactory;
  const hardened = deployed !== "" && storedFactory.toLowerCase() === deployed.toLowerCase();
  factoryVersionEl.textContent = hardened
    ? `Hardened factory ${deployed}. This bytecode rejects crossOrigin. Approval gas limit ${EXECUTE_GAS_LIMIT.toLocaleString("en-US")}.`
    : "This is not the hardened factory. An account deployed from it will not reject cross-origin ceremonies.";

  if (!passkey) {
    passkeyStatus.textContent = "No passkey yet. Use this computer, a phone, or a security key. Nothing about it is a seed phrase.";
  } else if (passkey.rpId !== binding.rpId || passkey.origin !== binding.origin) {
    passkeyStatus.textContent = `A passkey for ${passkey.origin} is saved in this browser profile. This page is ${binding.origin}. Create the account from the host that made the passkey.`;
  } else {
    passkeyStatus.textContent = `Passkey ready. Public key x ${short(passkey.qx)} y ${short(passkey.qy)}. There is no spending key in this page.`;
  }

  const account = accountAddress();
  accountStatus.textContent = account
    ? account
    : "No account on this chain yet. Deploying publishes qx, qy, the hostname, and the origin. The burner pays for that deployment. It does not become the owner.";
  nonceEl.textContent = "—";
  if (!account) accountBalanceEl.textContent = "—";

  const secure = window.isSecureContext;
  secureEl.hidden = secure;
  if (!secure) {
    secureEl.textContent = "WebAuthn only runs on localhost or https. This page is not a secure context, so the passkey button will fail.";
  }
}

async function refreshBalances() {
  const { publicClient } = clients();
  try {
    const burnerBalance = await publicClient.getBalance({ address: burner.address });
    burnerBalanceEl.textContent = `${formatEther(burnerBalance)} ${chain.nativeCurrency.symbol}`;
  } catch (error) {
    burnerBalanceEl.textContent = "RPC unreachable";
    setStatus(explain(error), "bad");
  }
  const account = accountAddress();
  if (!account) return;
  try {
    const [balance, nonce] = await Promise.all([
      publicClient.getBalance({ address: account }),
      publicClient.readContract({ address: account, abi: accountAbi, functionName: "nonce" }),
    ]);
    accountBalanceEl.textContent = `${formatEther(balance)} ${chain.nativeCurrency.symbol}`;
    nonceEl.textContent = nonce.toString();
    const code = (await publicClient.getCode({ address: account })) ?? "0x";
    const hasCode = code !== "0x";
    const hardened = code.toLowerCase().includes("86324711");
    migrationEl.hidden = !hasCode || hardened;
    if (hasCode && !hardened) {
      migrationEl.textContent =
        "This account was created without the crossOrigin check. Deploy again with the hardened factory above. That is a new address. Move the MON with a passkey approval before you leave this one.";
    }
  } catch (error) {
    accountBalanceEl.textContent = "unreadable";
    setStatus(explain(error), "bad");
  }
}

async function createPasskey() {
  const binding = pageBinding();
  if (!window.isSecureContext) throw new Error("WebAuthn needs localhost or https.");
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Witness", id: binding.rpId },
      user: { id: userId, name: "witness", displayName: "Witness" },
      challenge,
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      attestation: "none",
      timeout: 180_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("The authenticator returned nothing.");
  const response = credential.response as AuthenticatorAttestationResponse;
  const key = publicKeyFromAttestation(new Uint8Array(response.attestationObject));
  savePasskey({
    credentialId: toBase64Url(new Uint8Array(credential.rawId)),
    qx: bytesToBigint(key.x).toString(),
    qy: bytesToBigint(key.y).toString(),
    rpId: binding.rpId,
    origin: binding.origin,
    allowLocal: binding.allowLocal,
    accounts: {},
  });
  setStatus("Passkey created. The contract will be the authority, once you deploy it.", "good");
}

function requirePasskey(): SavedPasskey {
  if (!passkey) throw new Error("Create a passkey first.");
  const binding = pageBinding();
  if (passkey.rpId !== binding.rpId || passkey.origin !== binding.origin) {
    throw new Error(`This passkey was created for ${passkey.origin}. Open that host, or create a new passkey here.`);
  }
  return passkey;
}

function factoryAddress(): Address {
  const value = factoryInput.value.trim();
  if (!isAddress(value)) throw new Error("Paste the factory address from the deploy script.");
  return getAddress(value);
}

async function deployAccount() {
  const saved = requirePasskey();
  const factory = factoryAddress();
  const { publicClient, walletClient } = clients();
  const args = [BigInt(saved.qx), BigInt(saved.qy), saved.rpId, saved.origin, saved.allowLocal] as const;
  const predicted = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "predict",
    args,
  });
  const existing = await publicClient.getCode({ address: predicted });
  if (!existing || existing === "0x") {
    const fees = await feeFields();
    const hash = await walletClient.writeContract({
      account: burner,
      chain,
      address: factory,
      abi: factoryAbi,
      functionName: "createAccount",
      args,
      gas: CREATE_GAS_LIMIT,
      ...fees,
    });
    setStatus(`Deployment sent with gas limit ${CREATE_GAS_LIMIT.toLocaleString("en-US")}. Waiting…`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The factory transaction reverted.");
  }
  saved.accounts[String(chain.id)] = predicted;
  savePasskey(saved);
  setStatus(`Account is ${predicted}. Fund it, then approve a transfer with the passkey.`, "good");
}

async function fundAccount() {
  const account = accountAddress();
  if (!account) throw new Error("Deploy the account first.");
  const amount = parseAmount($<HTMLInputElement>("fund-amount").value);
  const { publicClient, walletClient } = clients();
  const fees = await feeFields();
  const hash = await walletClient.sendTransaction({
    account: burner,
    chain,
    to: account,
    value: amount,
    gas: FUND_GAS_LIMIT,
    ...fees,
  });
  setStatus("Moving MON from the gas payer into the account. The passkey is not involved.");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The funding transfer reverted.");
  setStatus("The account holds the MON. The gas payer still cannot spend it.", "good");
}

async function approveTransfer() {
  const saved = requirePasskey();
  const account = accountAddress();
  if (!account) throw new Error("Deploy the account first.");
  const toRaw = $<HTMLInputElement>("recipient").value.trim();
  if (!isAddress(toRaw)) throw new Error("Enter a recipient address.");
  const to = getAddress(toRaw);
  const value = parseAmount($<HTMLInputElement>("amount").value);
  const data = "0x" as Hex;
  const { publicClient, walletClient } = clients();
  const header = await publicClient.getBlock();
  const deadline = header.timestamp + 300n;
  const nonceAtSign = await publicClient.readContract({
    address: account,
    abi: accountAbi,
    functionName: "nonce",
  });
  if (readLock(account, nonceAtSign)) {
    throw new Error(
      "An approval for this nonce is already pending in this browser. Wait for it. A second one would revert, and the relayer would still pay if it had been broadcast.",
    );
  }
  const challenge = await publicClient.readContract({
    address: account,
    abi: accountAbi,
    functionName: "challengeFor",
    args: [to, value, data, deadline],
  });
  writeLock(account, nonceAtSign);
  setStatus("Approve this exact transfer with the same passkey. A phone uses the QR code. The challenge was read from the contract.");
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(hexToBytes(challenge)),
      rpId: saved.rpId,
      userVerification: "required",
      allowCredentials: [
        {
          type: "public-key",
          id: toArrayBuffer(fromBase64Url(saved.credentialId)),
          transports: ["internal", "hybrid", "usb", "ble", "nfc"],
        },
      ],
      timeout: 180_000,
    },
  })) as PublicKeyCredential | null;
  } catch (error) {
    clearLock(account, nonceAtSign);
    throw error;
  }
  if (!assertion) {
    clearLock(account, nonceAtSign);
    throw new Error("The authenticator returned nothing.");
  }
  const response = assertion.response as AuthenticatorAssertionResponse;
  const authenticatorData = new Uint8Array(response.authenticatorData);
  const clientDataJSON = new Uint8Array(response.clientDataJSON);
  const { r, s } = parseEcdsaSignature(new Uint8Array(response.signature));
  const args = [to, value, data, deadline, toHex(authenticatorData), toHex(clientDataJSON), r, s] as const;
  const digest = await publicClient.readContract({
    address: account,
    abi: accountAbi,
    functionName: "assertionHash",
    args: [toHex(authenticatorData), toHex(clientDataJSON)],
  });
  const nonceAfter = await publicClient.readContract({
    address: account,
    abi: accountAbi,
    functionName: "nonce",
  });
  const challengeAfter = await publicClient.readContract({
    address: account,
    abi: accountAbi,
    functionName: "challengeFor",
    args: [to, value, data, deadline],
  });
  if (nonceAfter !== nonceAtSign || challengeAfter !== challenge) {
    clearLock(account, nonceAtSign);
    throw new Error(
      "The nonce changed while you were approving. This was a race, not a failed signature. Nothing was submitted, so the gas payer was not charged. Approve again.",
    );
  }
  // Monad bills the gas limit even when execute reverts. Simulate first and refuse to broadcast.
  try {
    await publicClient.simulateContract({
      account: burner,
      address: account,
      abi: accountAbi,
      functionName: "execute",
      args,
      gas: EXECUTE_GAS_LIMIT,
    });
  } catch (error) {
    clearLock(account, nonceAtSign);
    throw new Error(`Not submitted, so the gas payer was not charged. ${explain(error)}`);
  }
  const fees = await feeFields();
  const hash = await walletClient.writeContract({
    account: burner,
    chain,
    address: account,
    abi: accountAbi,
    functionName: "execute",
    args,
    gas: EXECUTE_GAS_LIMIT,
    ...fees,
  });
  setStatus(`Submitted. Gas limit ${EXECUTE_GAS_LIMIT.toLocaleString("en-US")}. The precompile sees ${digest}.`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    clearLock(account, nonceAtSign);
    throw new Error(
      "The transfer reverted after it was broadcast. If another approval used this nonce, that is the expected race, not a stolen signature. Failed calls can still consume significant gas.",
    );
  }
  const explorer = chain.blockExplorers?.default.url;
  receiptEl.hidden = false;
  receiptEl.innerHTML = "";
  const line = document.createElement("p");
  line.textContent = `Settled. Nonce consumed. Digest checked at 0x0100: ${digest}.`;
  receiptEl.append(line);
  if (explorer) {
    const link = document.createElement("a");
    link.href = `${explorer}/tx/${hash}`;
    link.textContent = "View the transaction";
    link.rel = "noreferrer";
    link.target = "_blank";
    receiptEl.append(link);
  }
  clearLock(account, nonceAtSign);
  setStatus("The passkey approved it. The burner only posted the transaction.", "good");
}


function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function parseAmount(raw: string): bigint {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/u.test(trimmed)) throw new Error("Enter an amount like 0.1");
  return parseEther(trimmed);
}

function bind() {
  for (const net of networks) {
    const option = document.createElement("option");
    option.value = String(net.id);
    option.textContent = `${net.name} · ${net.id}`;
    networkEl.append(option);
  }
  networkEl.addEventListener("change", () => {
    const next = networks.find((item) => item.id === Number(networkEl.value));
    if (!next) return;
    chain = next;
    receiptEl.hidden = true;
    render();
    void refreshBalances();
  });
  factoryInput.addEventListener("change", () => {
    const value = factoryInput.value.trim();
    if (value === "") {
      localStorage.removeItem(factoryStorageKey(chain.id));
      return;
    }
    if (!isAddress(value)) {
      setStatus("That factory address is not an address.", "bad");
      return;
    }
    localStorage.setItem(factoryStorageKey(chain.id), getAddress(value));
    setStatus("Factory address saved for this chain.", "good");
  });
  $("create-passkey").addEventListener("click", (event) => run(createPasskey, event.currentTarget as HTMLButtonElement));
  $("deploy").addEventListener("click", (event) => run(deployAccount, event.currentTarget as HTMLButtonElement));
  $("fund").addEventListener("click", (event) => run(fundAccount, event.currentTarget as HTMLButtonElement));
  $("approve").addEventListener("click", (event) => run(approveTransfer, event.currentTarget as HTMLButtonElement));
  $("refresh").addEventListener("click", () => run(refreshBalances));
  $("reveal-key").addEventListener("click", () => {
    burnerKeyEl.textContent = burnerKey();
  });
  $("new-burner").addEventListener("click", () => {
    burner = replaceBurner();
    render();
    void refreshBalances();
    setStatus("New gas payer. The old one is still in its history, but this browser has forgotten it.", "idle");
  });
  $("forget-passkey").addEventListener("click", () => {
    savePasskey(null);
    render();
    setStatus("Forgot the passkey record in this browser. The phone, security key, or this computer may still have the credential.", "idle");
  });
}

async function run(action: () => Promise<void> | void, button?: HTMLButtonElement) {
  if (button) button.disabled = true;
  try {
    await action();
    render();
    await refreshBalances();
  } catch (error) {
    setStatus(explain(error), "bad");
    render();
  } finally {
    if (button) button.disabled = false;
  }
}

bind();
render();
void refreshBalances();
