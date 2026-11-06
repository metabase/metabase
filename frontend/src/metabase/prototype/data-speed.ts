import { DATA_SPEED } from "./settings";
import {
  getPrototypeSetting,
  usePrototypeSetting,
} from "./use-prototype-setting";

/**
 * Prototype: true when the user chose slow data in the prototype settings.
 * The backend reads the same choice from a request header, see
 * `metabase.prototype.slow-queries`.
 */
export function isSlowData(): boolean {
  return getPrototypeSetting(DATA_SPEED) === "slow";
}

export function useIsSlowData(): boolean {
  const [dataSpeed] = usePrototypeSetting(DATA_SPEED);
  return dataSpeed === "slow";
}
