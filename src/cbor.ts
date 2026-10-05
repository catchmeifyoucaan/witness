export type Cbor =
  | number
  | bigint
  | Uint8Array
  | string
  | boolean
  | null
  | Cbor[]
  | Map<Cbor, Cbor>;

export function decodeCbor(data: Uint8Array): Cbor {
  const [value, offset] = decodeCborAt(data, 0);
  if (offset !== data.length) {
    throw new Error("CBOR value did not consume the buffer.");
  }
  return value;
}

export function decodeCborAt(data: Uint8Array, offset: number): [Cbor, number] {
  if (offset >= data.length) throw new Error("CBOR ended early.");
  const initial = data[offset];
  const major = initial >> 5;
  const ai = initial & 0x1f;
  let cursor = offset + 1;

  if (major === 7 && ai === 31) throw new Error("Indefinite CBOR is not accepted.");

  if (major === 0 || major === 1) {
    const [n, next] = readArg(data, cursor, ai);
    const value = major === 0 ? n : -1n - n;
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return [Number(value), next];
    }
    return [value, next];
  }

  if (major === 2 || major === 3) {
    const [len, next] = readArg(data, cursor, ai);
    const size = Number(len);
    const start = next;
    const end = start + size;
    if (end > data.length) throw new Error("CBOR bytes run past the buffer.");
    const slice = data.slice(start, end);
    if (major === 2) return [slice, end];
    return [new TextDecoder().decode(slice), end];
  }

  if (major === 4) {
    const [len, next] = readArg(data, cursor, ai);
    const items: Cbor[] = [];
    cursor = next;
    for (let i = 0; i < Number(len); i++) {
      const [item, after] = decodeCborAt(data, cursor);
      items.push(item);
      cursor = after;
    }
    return [items, cursor];
  }

  if (major === 5) {
    const [len, next] = readArg(data, cursor, ai);
    const map = new Map<Cbor, Cbor>();
    cursor = next;
    for (let i = 0; i < Number(len); i++) {
      const [key, afterKey] = decodeCborAt(data, cursor);
      const [value, afterValue] = decodeCborAt(data, afterKey);
      map.set(key, value);
      cursor = afterValue;
    }
    return [map, cursor];
  }

  if (major === 7) {
    if (ai === 20) return [false, cursor];
    if (ai === 21) return [true, cursor];
    if (ai === 22) return [null, cursor];
    throw new Error("Unsupported CBOR simple value.");
  }

  throw new Error("Unsupported CBOR major type.");
}

function readArg(data: Uint8Array, offset: number, ai: number): [bigint, number] {
  if (ai < 24) return [BigInt(ai), offset];
  if (ai === 24) return [BigInt(need(data, offset, 1)[0]), offset + 1];
  if (ai === 25) {
    const b = need(data, offset, 2);
    return [(BigInt(b[0]) << 8n) | BigInt(b[1]), offset + 2];
  }
  if (ai === 26) {
    const b = need(data, offset, 4);
    let n = 0n;
    for (const byte of b) n = (n << 8n) | BigInt(byte);
    return [n, offset + 4];
  }
  if (ai === 27) {
    const b = need(data, offset, 8);
    let n = 0n;
    for (const byte of b) n = (n << 8n) | BigInt(byte);
    return [n, offset + 8];
  }
  throw new Error("Indefinite or reserved CBOR length.");
}

function need(data: Uint8Array, offset: number, len: number): Uint8Array {
  if (offset + len > data.length) throw new Error("CBOR length runs past the buffer.");
  return data.subarray(offset, offset + len);
}
