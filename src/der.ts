/** Pull r and s out of a WebAuthn ES256 signature (DER, or raw 64 bytes). */
export function parseEcdsaSignature(sig: Uint8Array): { r: bigint; s: bigint } {
  if (sig.length === 64) {
    return { r: readUnsigned(sig, 0, 32), s: readUnsigned(sig, 32, 32) };
  }
  if (sig.length === 0 || sig[0] !== 0x30) {
    throw new Error("The passkey signature was neither DER nor a raw 64-byte P-256 signature.");
  }
  const seq = readLength(sig, 1);
  if (seq.next + seq.len !== sig.length) {
    throw new Error("The DER signature length does not match the buffer.");
  }
  const r = readInteger(sig, seq.next);
  const s = readInteger(sig, r.next);
  if (s.next !== sig.length) throw new Error("Trailing bytes after the passkey signature.");
  return { r: r.value, s: s.value };
}

function readInteger(sig: Uint8Array, offset: number): { value: bigint; next: number } {
  if (sig[offset] !== 0x02) throw new Error("Expected a DER integer in the passkey signature.");
  const len = readLength(sig, offset + 1);
  const end = len.next + len.len;
  if (end > sig.length) throw new Error("DER integer runs past the signature.");
  return { value: readUnsigned(sig, len.next, len.len), next: end };
}

function readLength(sig: Uint8Array, offset: number): { len: number; next: number } {
  const b = sig[offset];
  if (b === undefined) throw new Error("DER length is missing.");
  if ((b & 0x80) === 0) return { len: b, next: offset + 1 };
  const bytes = b & 0x7f;
  if (bytes === 0 || bytes > 3) throw new Error("Unsupported DER length.");
  let len = 0;
  for (let i = 0; i < bytes; i++) len = (len << 8) | sig[offset + 1 + i];
  return { len, next: offset + 1 + bytes };
}

function readUnsigned(sig: Uint8Array, start: number, len: number): bigint {
  let value = 0n;
  for (let i = 0; i < len; i++) value = (value << 8n) | BigInt(sig[start + i]);
  return value;
}
