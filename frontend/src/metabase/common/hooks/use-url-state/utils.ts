import type { QueryParam } from "./types";

export function getFirstParamValue(param: QueryParam) {
  return Array.isArray(param) ? param[0] : param;
}
