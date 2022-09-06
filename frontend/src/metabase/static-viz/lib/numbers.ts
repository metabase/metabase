export type NumberFormatOptions = {
  number_style?: "currency" | "decimal" | "scientific" | "percentage";
  currency?: string;
  currency_style?: string;
  number_separators?: ".,";
  decimals?: number;
  scale?: number;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
};

const DEFAULT_OPTIONS = {
  number_style: "decimal" as NumberFormatOptions["number_style"],
  currency: undefined,
  currency_style: "symbol",
  number_separators: ".,",
  decimals: undefined,
  scale: 1,
  prefix: "",
  suffix: "",
};

export const formatNumber = (number: number, options?: NumberFormatOptions) => {
  const {
    number_style,
    currency,
    currency_style,
    number_separators: [decimal_separator, grouping_separator],
    decimals,
    scale,
    prefix,
    suffix,
    compact,
  } = { ...DEFAULT_OPTIONS, ...options };

  function createFormat(compact?: boolean) {
    if (compact) {
      return new Intl.NumberFormat("en", {
        style: number_style !== "scientific" ? number_style : "decimal",
        notation: "compact",
        compactDisplay: "short",
        currency: currency,
        currencyDisplay: currency_style,
        useGrouping: true,
      });
    }

    return new Intl.NumberFormat("en", {
      style: number_style !== "scientific" ? number_style : "decimal",
      notation: number_style !== "scientific" ? "standard" : "scientific",
      currency: currency,
      currencyDisplay: currency_style,
      useGrouping: true,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals != null ? decimals : 2,
    });
  }

  const format = createFormat(compact);

  const formattedNumber = format
    .format(number * scale)
    .replace(/\./g, decimal_separator)
    .replace(/,/g, grouping_separator ?? "");

  return `${prefix}${formattedNumber}${suffix}`;
};

export const formatPercent = (percent: number) =>
  `${(100 * percent).toFixed(2)} %`;
