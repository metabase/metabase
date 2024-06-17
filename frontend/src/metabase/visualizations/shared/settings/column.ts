import { isCurrency, isPercentage } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

export function getDefaultNumberStyle(
  column: DatasetColumn,
  settings: VisualizationSettings,
) {
  if (isCurrency(column) && settings["currency"]) {
    return "currency";
  }

  if (isPercentage(column)) {
    return "percent";
  }

  return "decimal";
}

export function getDefaultCurrency() {
  return "USD";
}

// This list should be the same as the one in `supports-symbol?` in
// currency.cljc. We copied it manually because importing it would lead to a
// `window` usage in a dependent import, which will break static viz since it's
// not supported by GraalVM.
const CURRENCIES_WITH_SYMBOLS = new Set([
  "USD",
  "CAD",
  "EUR",
  "AUD",
  "BRL",
  "CNY",
  "GBP",
  "HKD",
  "ILS",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "NZD",
  "TWD",
  "VND",
]);

export function getDefaultCurrencyStyle(
  _column: any,
  settings: VisualizationSettings,
) {
  const c = settings["currency"] || "USD";
  return CURRENCIES_WITH_SYMBOLS.has(c) ? "symbol" : "code";
}

export function getDefaultCurrencyInHeader() {
  return true;
}

export function getDefaultNumberSeparators() {
  return ".,";
}
