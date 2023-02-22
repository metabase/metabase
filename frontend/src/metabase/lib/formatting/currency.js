import { currency_symbol } from "cljs/metabase.shared.util.currency";

export function getCurrencySymbol(currencyCode) {
  return currency_symbol(currencyCode) || currencyCode || "$";
}
