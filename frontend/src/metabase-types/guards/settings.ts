import { type EngineKey, engineKeys } from "metabase-types/api";

export function isEngineKey(value: string | undefined): value is EngineKey {
  return engineKeys.includes(value as EngineKey);
}
