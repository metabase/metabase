import { getCurrencySymbol } from "metabase/lib/formatting";
import { isCurrency, isPercentage } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

/**
 * Helper used for `getDefault` and `getProps` calculations in
 * frontend/src/metabase/visualizations/lib/settings/column.js
 */
export function getCurrency(currency: string, currencyStyle: string) {
  return (0)
    .toLocaleString("en", {
      style: "currency",
      currency: currency,
      currencyDisplay: currencyStyle,
    })
    .replace(/0([.,]0+)?/, "")
    .trim(); // strip off actual number
}

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

export function getDefaultCurrencyStyle(
  _column: any,
  settings: VisualizationSettings,
) {
  const c = settings["currency"] || "USD";
  return getCurrencySymbol(c) !== getCurrency(c, "code") ? "symbol" : "code";
}

export function getDefaultCurrencyInHeader() {
  return true;
}

export function getDefaultNumberSeparators() {
  return ".,";
}
