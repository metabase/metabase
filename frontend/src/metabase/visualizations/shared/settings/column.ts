import { isCurrency, isPercentage } from "metabase-lib/v1/types/utils/isa";
import type { ColumnSettings, DatasetColumn } from "metabase-types/api";

function hasDataSizeName(column: DatasetColumn): boolean {
  const name = column.name?.toLowerCase() || "";
  return /byte|_size$|file_?size|_data$|bandwidth|traffic|storage|capacity/.test(
    name,
  );
}

export function getDefaultNumberStyle(
  column: DatasetColumn,
  columnSettings: ColumnSettings,
) {
  if (isCurrency(column) && columnSettings["currency"]) {
    return "currency";
  }

  if (isPercentage(column)) {
    return "percent";
  }

  if (hasDataSizeName(column)) {
    return "datasize";
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
  "BTC",
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
  columnSettings: ColumnSettings,
) {
  const c = columnSettings["currency"] || "USD";
  return CURRENCIES_WITH_SYMBOLS.has(c) ? "symbol" : "code";
}

export function getDefaultCurrencyInHeader() {
  return true;
}

export function getDefaultNumberSeparators() {
  return ".,";
}

export function getDefaultDataSizeUnitSystem() {
  return "binary";
}

export function getDefaultDataSizeUnitInHeader() {
  return false;
}
