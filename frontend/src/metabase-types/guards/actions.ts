import type { HttpActionBodyValue } from "metabase-types/api";

import { isObject } from "./common";

export function isHttpActionBody(
  value: unknown,
): value is Record<string, HttpActionBodyValue> {
  return isObject(value) && !Array.isArray(value);
}
