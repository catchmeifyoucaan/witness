/**
 * Explicit transaction gas limits.
 *
 * Monad charges gas_limit * price, not gas used
 * (https://docs.monad.xyz/developer-essentials/gas-pricing). A wallet that
 * "estimates" a reverting call and then substitutes a huge limit would bill
 * that huge limit. Witness never estimates. These numbers come from
 * `forge test -vv` on Foundry's Monad EVM (network = "monad"), which prices
 * the real P256 precompile at 6900:
 *
 *   GAS_EXECUTE_INTERNAL        272043
 *   GAS_PRECOMPILE_STATICCALL     7273
 *   GAS_CALLDATA                  5356
 *   GAS_RECOMMENDED_TX_LIMIT    323399   (21000 + calldata + internal + 25000)
 *   GAS_CREATE_INTERNAL        1081512
 *
 * 480_000 covers the crossOrigin check plus a longer browser clientDataJSON.
 * 1_600_000 covers CREATE2 of the account plus code deposit. 60_000 covers a
 * plain MON transfer into the account's empty receive().
 *
 * At the minimum base fee of 100 MON-gwei, 480_000 gas costs 0.048 MON.
 */
export const EXECUTE_GAS_LIMIT = 480_000n;
export const CREATE_GAS_LIMIT = 1_600_000n;
export const FUND_GAS_LIMIT = 60_000n;
