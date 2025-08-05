import { type EngineKey, engineKeys } from "../api/settings";

export function isEngineKey(value: string | undefined): value is EngineKey {
  return engineKeys.includes(value as EngineKey);
}
