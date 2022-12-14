import React from "react";

import { format_number } from "cljs/metabase.shared.formatting.numbers";
import { getCurrencySymbol } from "./currency";

interface FormatNumberOptionsType {
  compact?: boolean;
  currency?: string;
  currency_in_header?: boolean;
  currency_style?: string;
  jsx?: boolean;
  maximum_fraction_digits?: number;
  minimum_fraction_digits?: number;
  minimum_integer_digits?: number;
  maximum_significant_digits?: number;
  minimum_significant_digits?: number;
  negative_in_parentheses?: boolean;
  number_separators?: string;
  number_style?: string;
  scale?: number;
  type?: string;
}

export function formatNumber(
  number: number,
  options: FormatNumberOptionsType = {},
) {
  let formatted = format_number(number, options);
  // TODO This logic should properly live in the table formatting.
  if (
    options.number_style === "currency" &&
    options.currency_in_header &&
    options.type === "cell"
  ) {
    formatted =
      formatted[0] === "-" || formatted[0] === "("
        ? formatted[0] + formatted.substring(2)
        : formatted.substring(1);
  }

  if (options.number_style === "scientific" && options.jsx) {
    const [m, n] = formatted.split("e");
    return (
      <span>
        {m}x10<sup>{n.replace(/^\+/, "")}</sup>
      </span>
    );
  }
  return formatted;
}
