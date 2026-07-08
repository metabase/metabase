import type { QueryParam } from "./types";

export function getFirstParamValue(param: QueryParam) {
  return Array.isArray(param) ? param[0] : param;
}

export const getAllParamValues = (param: QueryParam): string[] => {
  if (Array.isArray(param)) {
    return param.filter((v): v is string => typeof v === "string");
  }
  return typeof param === "string" ? [param] : [];
};
