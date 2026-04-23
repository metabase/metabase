import type { CustomVizDisplayType } from "metabase-types/api";

import { isObject } from "./common";

export function isObjectWithRaw<T>(
  object: T,
): object is T & { _raw: T | undefined } {
  return isObject(object) && "_raw" in object;
}

export const isCustomVizDisplay = (
  value: unknown,
): value is CustomVizDisplayType =>
  typeof value === "string" && value.startsWith("custom:");
