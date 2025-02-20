import { isNumeric, isString } from "metabase-lib/v1/types/utils/isa";

// predicate for columns that can be formatted

export const isFormattable = field => isNumeric(field) || isString(field);
export const getValueForDescription = rule =>
  ["is-null", "not-null"].includes(rule.operator) ? "" : ` ${rule.value}`;
