import type { Parameter } from "metabase-types/api";

export const getParameterPlaceholder = (param: Parameter): string => {
  if (Array.isArray(param.default)) {
    return param.default.join(", ");
  }

  return param.name.toLowerCase();
};
