import { isObject } from "metabase-types/guards";

/** True when an API error object is an HTTP 403 (forbidden). */
export function is403Error(error: unknown): boolean {
  return isObject(error) && error.status === 403;
}
