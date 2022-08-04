import { currency } from "cljs/metabase.shared.util.currency";

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
