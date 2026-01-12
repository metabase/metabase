import { t } from "ttag";

import { currency } from "cljs/metabase.util.currency";

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

export type CurrencyStyle = Intl.NumberFormatOptionsCurrencyDisplay;

export interface CurrencyStyleOption {
  name: string;
  value: CurrencyStyle;
}

export interface CompactCurrencyOptions {
  digits: number;
  currency_style: CurrencyStyle;
}

const getCurrencyMapCache = (() => {
  let currencyMapCache: Record<string, CurrencyInfo>;

  return () => {
    if (!currencyMapCache) {
      currencyMapCache = Object.fromEntries(currency);
    }

    return currencyMapCache;
  };
})();

export function getCurrencySymbol(currencyCode: string): string {
  return getCurrencyMapCache()[currencyCode]?.symbol || currencyCode || "$";
}

export function getCurrencyNarrowSymbol(currencyCode: string): string {
  return (
    getCurrencyMapCache()[currencyCode]?.symbol_native || currencyCode || "$"
  );
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
  value?: CurrencyStyle,
): CurrencyStyleOption[] {
  const symbol = getCurrencySymbol(currency);
  const narrowSymbol = getCurrencyNarrowSymbol(currency);
  const code = getCurrency(currency, "code");
  const name = getCurrency(currency, "name");
  return [
    ...(symbol !== code || value === "symbol"
      ? [
          {
            name: t`Symbol` + ` ` + `(${symbol})`,
            value: "symbol" as const,
          },
        ]
      : []),
    ...((narrowSymbol !== code && narrowSymbol !== symbol) ||
    value === "narrowSymbol"
      ? [
          {
            name: t`Local symbol` + ` ` + `(${narrowSymbol})`,
            value: "narrowSymbol" as const,
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
