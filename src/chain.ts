import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
});

export const localAnvil = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const networks = [monadTestnet, localAnvil] as const;
export type WitnessChain = (typeof networks)[number];

export const FAUCET_URL = "https://faucet.monad.xyz";

/** Factory deployed on Monad testnet (chain id 10143) on 4 Oct 2026. */
export const DEPLOYED_FACTORY: Partial<Record<number, Address>> = {
  10143: "0xB9a48ce4D7142BA985a9527cbFB9BaeD12Ef80Bc",
};

const BURNER_KEY = "witness.burner.v1";

export function loadBurner(): PrivateKeyAccount {
  const existing = localStorage.getItem(BURNER_KEY);
  if (existing && /^0x[0-9a-fA-F]{64}$/u.test(existing)) {
    return privateKeyToAccount(existing as Hex);
  }
  const created = generatePrivateKey();
  localStorage.setItem(BURNER_KEY, created);
  return privateKeyToAccount(created);
}

export function replaceBurner(): PrivateKeyAccount {
  const created = generatePrivateKey();
  localStorage.setItem(BURNER_KEY, created);
  return privateKeyToAccount(created);
}

export function burnerKey(): Hex {
  const existing = localStorage.getItem(BURNER_KEY);
  if (!existing) throw new Error("No gas-payer key yet.");
  return existing as Hex;
}

export function clientsFor(chain: WitnessChain, account: PrivateKeyAccount): {
  publicClient: PublicClient;
  walletClient: WalletClient;
} {
  const transport = http(chain.rpcUrls.default.http[0]);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  return { publicClient, walletClient };
}

export function factoryStorageKey(chainId: number): string {
  return `witness.factory.${chainId}`;
}
