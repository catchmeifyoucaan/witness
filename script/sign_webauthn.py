#!/usr/bin/env python3
"""Build a synthetic WebAuthn assertion and self-check it with cryptography.

argv: <d decimal> <challenge 0xhex32> <origin> <rpId>
stdout: JSON with authenticatorData, clientDataJSON, hash, r, s, qx, qy

The signed message is authenticatorData || SHA-256(clientDataJSON).
ES256 then hashes that message once more. That outer hash is what EIP-7951 checks.
"""
import base64
import hashlib
import json
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)


def main() -> None:
    d = int(sys.argv[1])
    challenge = bytes.fromhex(sys.argv[2].removeprefix("0x"))
    origin = sys.argv[3]
    rp_id = sys.argv[4]
    if len(challenge) != 32:
        raise SystemExit("challenge must be 32 bytes")

    key = ec.derive_private_key(d, ec.SECP256R1())
    challenge_b64 = base64.urlsafe_b64encode(challenge).decode().rstrip("=")
    client = (
        '{"type":"webauthn.get","challenge":"'
        + challenge_b64
        + '","origin":"'
        + origin
        + '","crossOrigin":false}'
    ).encode()
    auth = hashlib.sha256(rp_id.encode()).digest() + bytes([0x05]) + (0).to_bytes(4, "big")
    message = auth + hashlib.sha256(client).digest()
    digest = hashlib.sha256(message).digest()
    signature = key.sign(message, ec.ECDSA(hashes.SHA256()))
    key.public_key().verify(signature, message, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(signature)
    # Round-trip the exact (r, s) the precompile will see, not a re-encoding.
    key.public_key().verify(
        encode_dss_signature(r, s), message, ec.ECDSA(hashes.SHA256())
    )
    nums = key.public_key().public_numbers()
    json.dump(
        {
            "authenticatorData": "0x" + auth.hex(),
            "clientDataJSON": "0x" + client.hex(),
            "hash": "0x" + digest.hex(),
            "r": r,
            "s": s,
            "qx": nums.x,
            "qy": nums.y,
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
