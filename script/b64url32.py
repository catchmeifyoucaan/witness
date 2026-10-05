#!/usr/bin/env python3
"""Print unpadded base64url for a 32-byte hex word. Used to lock the Solidity encoder."""
import base64
import sys

raw = bytes.fromhex(sys.argv[1].removeprefix("0x"))
if len(raw) != 32:
    raise SystemExit("expected 32 bytes")
sys.stdout.write(base64.urlsafe_b64encode(raw).decode().rstrip("="))
