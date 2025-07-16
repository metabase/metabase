import { t } from "ttag";

import { currency } from "cljs/metabase.util.currency";

// Type definitions for currency data structure
export interface CurrencyInfo {
  symbol: string;
  name: string;
  symbol_native: string;
  decimal_digits: number;
  rounding: number;
  code: string;
  name_plural: string;
}

export interface CurrencyOption {
  name: string;
  value: string;
}

export interface CurrencyStyleOption {
  name: string;
  value: "symbol" | "code" | "name";
}

export interface CompactCurrencyOptions {
  digits: number;
  currency_style: string;
}

export type CurrencyStyle = "symbol" | "code" | "name";

// Cache for currency map
let currencyMapCache: Record<string, CurrencyInfo>;

export function getCurrencySymbol(currencyCode: string): string {
  if (!currencyMapCache) {
    // only turn the array into a map if we call this function
    currencyMapCache = Object.fromEntries(currency);
  }
  return currencyMapCache[currencyCode]?.symbol || currencyCode || "$";
}

export const COMPACT_CURRENCY_OPTIONS: CompactCurrencyOptions = {
  // Currencies vary in how many decimals they display, so this is probably
  // wrong in some cases. Intl.NumberFormat has some of that data built-in, but
  // I couldn't figure out how to use it here.
  digits: 2,
  currency_style: "symbol",
};

export function getCurrencyStyleOptions(
  currency = "USD",
): CurrencyStyleOption[] {
  const symbol = getCurrencySymbol(currency);
  const code = getCurrency(currency, "code");
  const name = getCurrency(currency, "name");
  return [
    ...(symbol !== code
      ? [
          {
            name: t`Symbol` + ` ` + `(${symbol})`,
            value: "symbol" as const,
          },
        ]
      : []),
    {
      name: t`Code` + ` ` + `(${code})`,
      value: "code" as const,
    },
    {
      name: t`Name` + ` ` + `(${name})`,
      value: "name" as const,
    },
  ];
}

export function getCurrency(
  currency: string,
  currencyStyle: CurrencyStyle,
): string {
  try {
    return (0)
      .toLocaleString("en", {
        style: "currency",
        currency: currency,
        currencyDisplay: currencyStyle,
      })
      .replace(/0([.,]0+)?/, "")
      .trim(); // strip off actual number
  } catch (e) {
    return currency;
  }
}

export function getCurrencyOptions(): CurrencyOption[] {
  return currency.map(([, currency]: [string, CurrencyInfo]) => ({
    name: currency.name,
    value: currency.code,
  }));
}

export function sortCurrencyOptionsByPriority<T extends { value: string }>(
  currencyOptions: T[],
  key: keyof T = "label" as keyof T,
): T[] {
  // Sort alphabetically by label keeping USD, CAD, and EUR in front
  return currencyOptions.sort((a, b) => {
    const priority = ["USD", "CAD", "EUR"];
    const aIdx = priority.indexOf(a.value);
    const bIdx = priority.indexOf(b.value);
    if (aIdx !== -1 && bIdx !== -1) {
      return aIdx - bIdx;
    }
    if (aIdx !== -1) {
      return -1;
    }
    if (bIdx !== -1) {
      return 1;
    }
    const aValue = a[key];
    const bValue = b[key];
    if (typeof aValue === "string" && typeof bValue === "string") {
      return aValue.localeCompare(bValue);
    }
    return 0;
  });
}
