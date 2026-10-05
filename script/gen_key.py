#!/usr/bin/env python3
"""Print a fresh P-256 key as JSON: d, qx, qy. Test-only. Never used by the app."""
import json
import sys

from cryptography.hazmat.primitives.asymmetric import ec


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    nums = key.public_key().public_numbers()
    json.dump(
        {"d": key.private_numbers().private_value, "qx": nums.x, "qy": nums.y},
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
