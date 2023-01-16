import { formatNumber as appFormatNumber } from "metabase/lib/formatting/numbers";

export type NumberFormatOptions = {
  number_style?: "currency" | "decimal" | "scientific" | "percentage";
  currency?: string;
  currency_style?: "symbol" | "code" | "name";
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
  const optionsWithDefault = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const { prefix, suffix } = optionsWithDefault;

  return `${prefix}${appFormatNumber(number, optionsWithDefault)}${suffix}`;
};

export const formatPercent = (percent: number) =>
  `${(100 * percent).toFixed(percent === 1 ? 0 : 2)} %`;
