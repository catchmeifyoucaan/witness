#!/usr/bin/env python3
"""Independently verify the Wycheproof P-256 vector committed in the Forge tests.

The hash is already the digest. cryptography must be told not to hash it again.
Exits non-zero if the vector is not a real signature, so a mock cannot launder it.
"""
import sys

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    encode_dss_signature,
)
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed

# execution-spec-tests EIP-7951 H0/R0/S0/X0/Y0, itself from Wycheproof
# ecdsa_secp256r1_sha256_test.json (case with a SHA-256 digest).
H = bytes.fromhex("bb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023")
R = 0x2BA3A8BE6B94D5EC80A6D9D1190A436EFFE50D85A1EEE859B8CC6AF9BD5C2E18
S = 0x4CD60B855D442F5B3C7B11EB6C4E0AE7525FE710FAB9AA7C77A67F79E6FADD76
X = 0x2927B10512BAE3EDDCFE467828128BAD2903269919F7086069C8C4DF6C732838
Y = 0xC7787964EAAC00E5921FB1498A60F4606766B3D9685001558D1A974E7341513E
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551

pub = ec.EllipticCurvePublicNumbers(X, Y, ec.SECP256R1()).public_key()
pub.verify(encode_dss_signature(R, S), H, ec.ECDSA(Prehashed(hashes.SHA256())))

high = N - S
try:
    pub.verify(encode_dss_signature(R, high), H, ec.ECDSA(Prehashed(hashes.SHA256())))
    high_note = "python-accepts-high-s"
except InvalidSignature:
    high_note = "python-rejects-high-s"

sys.stdout.write("ok " + high_note + "\n")
