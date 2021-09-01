export const formatNumber = (
  value,
  {
    number_style = "decimal",
    currency,
    currency_style = "symbol",
    number_separators: [decimal_separator, grouping_separator] = ".,",
    decimals,
    scale = 1,
    prefix = "",
    suffix = "",
  } = {},
) => {
  const format = new Intl.NumberFormat("en", {
    style: number_style !== "scientific" ? number_style : "decimal",
    notation: number_style !== "scientific" ? "standard" : "scientific",
    currency: currency,
    currencyDisplay: currency_style,
    useGrouping: true,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals != null ? decimals : 2,
  });

  const formattedNumber = format
    .format(value * scale)
    .replace(/\./g, decimal_separator)
    .replace(/,/g, grouping_separator);

  return `${prefix}${formattedNumber}${suffix}`;
};
