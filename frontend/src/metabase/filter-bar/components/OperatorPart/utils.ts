import type { FilterOperator } from "../../types";

const SHOWN_AS_SYMBOL_KEYS = [">", "<", ">=", "<="];

export const isShownAsSymbol = (operator: FilterOperator) =>
  SHOWN_AS_SYMBOL_KEYS.includes(operator.key);

export const getOperatorText = (operator: FilterOperator) =>
  isShownAsSymbol(operator) ? operator.key : operator.label;
