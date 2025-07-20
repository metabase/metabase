import { match } from "ts-pattern";

import type { Parameter, ParameterType } from "metabase-types/api";

export const getParameterPlaceholder = (param: Parameter): string => {
  // If the parameter has a list of default values.
  if (Array.isArray(param.default)) {
    return `${param.default.join(", ")}`;
  }

  // If the parameter has a single default value.
  if (param.default != null) {
    return String(param.default);
  }

  return getPlaceholderByParamType(param.type);
};

const getPlaceholderByParamType = (paramType: ParameterType): string => {
  // parameter type format is "type/subtype", e.g. "date/range",
  const [type, subtype] = paramType.split("/");

  // see [enterprise/backend/src/metabase_enterprise/metabot_v3/query_analyzer/parameter_substitution.clj] for list of default values
  return match({ type, subtype })
    .with({ type: "date", subtype: "single" }, () => "2024-01-09")
    .with({ type: "date", subtype: "range" }, () => "2023-01-09~2024-01-09")
    .with({ type: "date", subtype: "relative" }, () => "past1years")
    .with({ type: "date", subtype: "month-year" }, () => "2024-01")
    .with({ type: "date", subtype: "quarter-year" }, () => "Q1-2024")
    .with({ type: "date", subtype: "all-options" }, () => "2024-01-09")
    .with({ type: "date" }, () => "2024-01-09")
    .with({ type: "temporal-unit" }, () => "minute, hour, day, month, year")
    .with({ type: "number", subtype: "between" }, () => "50 100")
    .with({ type: "number" }, () => "1")
    .with({ type: "string" }, () => "sample text")
    .with({ type: "boolean" }, () => "true")
    .with({ type: "category" }, () => "sample category")
    .with({ type: "id" }, () => "1")
    .otherwise(() => "");
};
