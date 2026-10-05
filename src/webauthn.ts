import { decodeCbor, decodeCborAt, type Cbor } from "./cbor";

export type P256PublicKey = {
  x: Uint8Array;
  y: Uint8Array;
  credentialId: Uint8Array;
};

const UP = 0x01;
const UV = 0x04;
const AT = 0x40;
const ED = 0x80;

/** COSE EC2 P-256 key from a WebAuthn attestationObject. No seed, no secp256k1 key. */
export function publicKeyFromAttestation(attestationObject: Uint8Array): P256PublicKey {
  const root = decodeCbor(attestationObject);
  if (!(root instanceof Map)) throw new Error("attestationObject is not a CBOR map.");
  const authData = mapBytes(root, "authData");
  return publicKeyFromAuthData(authData);
}

export function publicKeyFromAuthData(authData: Uint8Array): P256PublicKey {
  if (authData.length < 37) throw new Error("Authenticator data is too short.");
  const flags = authData[32];
  if ((flags & UP) === 0) throw new Error("The authenticator did not say a person was present.");
  if ((flags & UV) === 0) throw new Error("The authenticator did not verify you.");
  if ((flags & AT) === 0) throw new Error("The ceremony did not include a new credential.");

  let offset = 37 + 16;
  if (offset + 2 > authData.length) throw new Error("Credential id length is missing.");
  const credLen = (authData[offset] << 8) | authData[offset + 1];
  offset += 2;
  const credentialId = authData.slice(offset, offset + credLen);
  offset += credLen;
  if (credentialId.length !== credLen) throw new Error("Credential id was truncated.");

  const [key, next] = decodeCborAt(authData, offset);
  if (!(key instanceof Map)) throw new Error("Credential public key is not a CBOR map.");
  if ((flags & ED) === 0 && next !== authData.length) {
    throw new Error("The public key did not end where authenticator data ends.");
  }

  const kty = key.get(1);
  const crv = key.get(-1);
  const x = key.get(-2);
  const y = key.get(-3);
  if (kty !== 2 || crv !== 1) {
    throw new Error("Witness only accepts a P-256 passkey (COSE ES256).");
  }
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error("The passkey public key coordinates were not byte strings.");
  }
  if (x.length !== 32 || y.length !== 32) {
    throw new Error("P-256 coordinates must be 32 bytes.");
  }
  return { x, y, credentialId };
}

function mapBytes(map: Map<Cbor, Cbor>, key: string): Uint8Array {
  const value = map.get(key);
  if (!(value instanceof Uint8Array)) throw new Error(`${key} was not a byte string.`);
  return value;
}

export function bytesToBigint(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
