import { t } from "ttag";

import { currency } from "cljs/metabase.util.currency";

let currencyMapCache;

export function getCurrencySymbol(currencyCode) {
  if (!currencyMapCache) {
    // only turn the array into a map if we call this function
    currencyMapCache = Object.fromEntries(currency);
  }
  return currencyMapCache[currencyCode]?.symbol || currencyCode || "$";
}

export const COMPACT_CURRENCY_OPTIONS = {
  // Currencies vary in how many decimals they display, so this is probably
  // wrong in some cases. Intl.NumberFormat has some of that data built-in, but
  // I couldn't figure out how to use it here.
  digits: 2,
  currency_style: "symbol",
};

export function getCurrencyStyleOptions(currency = "USD") {
  const symbol = getCurrencySymbol(currency);
  const code = getCurrency(currency, "code");
  const name = getCurrency(currency, "name");
  return [
    ...(symbol !== code
      ? [
          {
            name: t`Symbol` + ` ` + `(${symbol})`,
            value: "symbol",
          },
        ]
      : []),
    {
      name: t`Code` + ` ` + `(${code})`,
      value: "code",
    },
    {
      name: t`Name` + ` ` + `(${name})`,
      value: "name",
    },
  ];
}

export function getCurrency(currency, currencyStyle) {
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

export function getCurrencyOptions() {
  return currency.map(([, currency]) => ({
    name: currency.name,
    value: currency.code,
  }));
}
