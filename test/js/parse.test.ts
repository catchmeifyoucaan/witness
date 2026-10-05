import assert from "node:assert/strict";
import test from "node:test";
import { decodeCbor } from "../../src/cbor";
import { parseEcdsaSignature } from "../../src/der";
import { fromBase64Url, publicKeyFromAttestation, toBase64Url } from "../../src/webauthn";

test("base64url round trip is unpadded", () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const encoded = toBase64Url(bytes);
  assert.equal(encoded.includes("="), false);
  assert.deepEqual(fromBase64Url(encoded), bytes);
});

test("DER and raw P-256 signatures decode to the same r and s", () => {
  const r = new Uint8Array(32).fill(0x11);
  const s = new Uint8Array(32).fill(0x22);
  r[0] = 0x7f;
  const raw = new Uint8Array([...r, ...s]);
  const der = new Uint8Array([0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s]);
  const padded = new Uint8Array([0x30, 0x46, 0x02, 0x21, 0x00, ...r, 0x02, 0x21, 0x00, ...s]);
  const a = parseEcdsaSignature(raw);
  const b = parseEcdsaSignature(der);
  const c = parseEcdsaSignature(padded);
  assert.equal(a.r, b.r);
  assert.equal(a.s, b.s);
  assert.equal(c.r, a.r);
  assert.equal(c.s, a.s);
});

test("attestationObject yields the COSE P-256 coordinates", () => {
  const x = Uint8Array.from({ length: 32 }, (_, i) => i);
  const y = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
  const cred = Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i);
  const cose = new Uint8Array([
    0xa5,
    0x01, 0x02,
    0x03, 0x26,
    0x20, 0x01,
    0x21, 0x58, 0x20, ...x,
    0x22, 0x58, 0x20, ...y,
  ]);
  const auth = new Uint8Array([
    ...new Uint8Array(32).fill(0xab),
    0x45,
    0, 0, 0, 1,
    ...new Uint8Array(16),
    0x00, cred.length,
    ...cred,
    ...cose,
  ]);
  const attestation = new Uint8Array([
    0xa3,
    0x63, 0x66, 0x6d, 0x74, 0x64, 0x6e, 0x6f, 0x6e, 0x65,
    0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, 0xa0,
    0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, 0x58, auth.length,
    ...auth,
  ]);
  const key = publicKeyFromAttestation(attestation);
  assert.deepEqual(key.x, x);
  assert.deepEqual(key.y, y);
  assert.deepEqual(key.credentialId, cred);
  const root = decodeCbor(attestation);
  assert.ok(root instanceof Map);
  assert.equal(root.get("fmt"), "none");
});
