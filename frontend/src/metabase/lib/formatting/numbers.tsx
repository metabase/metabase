import d3 from "d3";
import Humanize from "humanize-plus";

import { COMPACT_CURRENCY_OPTIONS, getCurrencySymbol } from "./currency";

const DISPLAY_COMPACT_DECIMALS_CUTOFF = 1000;
const FIXED_NUMBER_FORMATTER = d3.format(",.f");
const PRECISION_NUMBER_FORMATTER = d3.format(".2f");

interface FormatNumberOptionsType {
  _numberFormatter?: any;
  compact?: boolean;
  currency?: string;
  currency_in_header?: boolean;
  currency_style?: string;
  decimals?: string | number;
  jsx?: any;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  minimumIntegerDigits?: number;
  maximumSignificantDigits?: number;
  minimumSignificantDigits?: number;
  negativeInParentheses?: boolean;
  number_separators?: string;
  number_style?: string;
  scale?: number;
  type?: string;
}

interface DEFAULT_NUMBER_OPTIONS_TYPE {
  compact: boolean;
  maximumFractionDigits: number;
  minimumFractionDigits?: number;
}

const DEFAULT_NUMBER_OPTIONS: DEFAULT_NUMBER_OPTIONS_TYPE = {
  compact: false,
  maximumFractionDigits: 2,
};

// for extracting number portion from a formatted currency string
//
// NOTE: match minus/plus and number separately to handle interposed currency symbol -$1.23
const NUMBER_REGEX = /([\+\-])?[^0-9]*([0-9\., ]+)/;

const DEFAULT_NUMBER_SEPARATORS = ".,";

function getDefaultNumberOptions(options: { decimals?: string | number }) {
  const defaults = { ...DEFAULT_NUMBER_OPTIONS };

  // decimals sets the exact number of digits after the decimal place
  if (typeof options.decimals === "number" && !isNaN(options.decimals)) {
    defaults.minimumFractionDigits = options.decimals;
    defaults.maximumFractionDigits = options.decimals;
  }

  return defaults;
}

export function formatNumber(
  number: number,
  options: FormatNumberOptionsType = {},
): any {
  options = { ...getDefaultNumberOptions(options), ...options };

  if (typeof options.scale === "number" && !isNaN(options.scale)) {
    number = options.scale * number;
  }

  if (number < 0 && options.negativeInParentheses) {
    return (
      "(" +
      formatNumber(-number, { ...options, negativeInParentheses: false }) +
      ")"
    );
  }

  if (options.compact) {
    return formatNumberCompact(number, options);
  } else if (options.number_style === "scientific") {
    return formatNumberScientific(number, options);
  } else {
    try {
      let nf;
      if (
        number < 1 &&
        number > -1 &&
        options.decimals == null &&
        options.number_style !== "percent"
      ) {
        // NOTE: special case to match existing behavior for small numbers, use
        // max significant digits instead of max fraction digits
        nf = numberFormatterForOptions({
          ...options,
          maximumSignificantDigits: Math.max(
            2,
            options.minimumSignificantDigits || 0,
          ),
          maximumFractionDigits: undefined,
        });
      } else if (options._numberFormatter) {
        // NOTE: options._numberFormatter allows you to provide a predefined
        // Intl.NumberFormat object for increased performance
        nf = options._numberFormatter;
      } else {
        nf = numberFormatterForOptions(options);
      }

      let formatted = nf.format(number);

      // extract number portion of currency if we're formatting a cell
      if (
        options["type"] === "cell" &&
        options["currency_in_header"] &&
        options["number_style"] === "currency"
      ) {
        const match = formatted.match(NUMBER_REGEX);
        if (match) {
          formatted = (match[1] || "").trim() + (match[2] || "").trim();
        }
      }

      // replace the separators if not default
      const separators = options["number_separators"];
      if (separators && separators !== DEFAULT_NUMBER_SEPARATORS) {
        formatted = replaceNumberSeparators(formatted, separators);
      }

      // fixes issue where certain symbols, such as
      // czech Kč, and Bitcoin ₿, are not displayed
      if (options["currency_style"] === "symbol") {
        formatted = formatted.replace(
          options["currency"],
          getCurrencySymbol(options["currency"] as string),
        );
      }

      return formatted;
    } catch (e) {
      console.warn("Error formatting number", e);
      // fall back to old, less capable formatter
      // NOTE: does not handle things like currency, percent
      return FIXED_NUMBER_FORMATTER(
        d3.round(number, options.maximumFractionDigits),
      );
    }
  }
}

export function formatChangeWithSign(
  change: number,
  { maximumFractionDigits = 2 } = {},
): string {
  if (change === Infinity) {
    return "+∞%";
  }

  const formattedNumber = formatNumber(change, {
    number_style: "percent",
    maximumFractionDigits,
  });

  return change > 0 ? `+${formattedNumber}` : formattedNumber;
}

export function numberFormatterForOptions(options: FormatNumberOptionsType) {
  options = { ...getDefaultNumberOptions(options), ...options };
  // always use "en" locale so we have known number separators we can replace depending on number_separators option
  // TODO: if we do that how can we get localized currency names?
  return new Intl.NumberFormat("en", {
    style: options.number_style,
    currency: options.currency,
    currencyDisplay: options.currency_style,
    // always use grouping separators, but we may replace/remove them depending on number_separators option
    useGrouping: true,
    minimumIntegerDigits: options.minimumIntegerDigits,
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
    minimumSignificantDigits: options.minimumSignificantDigits,
    maximumSignificantDigits: options.maximumSignificantDigits,
  }) as any;
}

function formatNumberCompact(value: number, options: FormatNumberOptionsType) {
  if (options.number_style === "percent") {
    return formatNumberCompactWithoutOptions(value * 100) + "%";
  }
  if (options.number_style === "currency") {
    try {
      const nf = numberFormatterForOptions({
        ...options,
        ...COMPACT_CURRENCY_OPTIONS,
      });

      if (Math.abs(value) < DISPLAY_COMPACT_DECIMALS_CUTOFF) {
        return nf.format(value);
      }
      const { value: currency } = nf
        .formatToParts(value)
        .find((p: any) => p.type === "currency");

      const valueSign = value < 0 ? "-" : "";

      return (
        valueSign +
        currency +
        formatNumberCompactWithoutOptions(Math.abs(value))
      );
    } catch (e) {
      // Intl.NumberFormat failed, so we fall back to a non-currency number
      return formatNumberCompactWithoutOptions(value);
    }
  }
  if (options.number_style === "scientific") {
    return formatNumberScientific(value, {
      ...options,
      // unsetting maximumFractionDigits prevents truncation of small numbers
      maximumFractionDigits: undefined,
      minimumFractionDigits: 1,
    });
  }
  return formatNumberCompactWithoutOptions(value);
}

function formatNumberCompactWithoutOptions(value: number) {
  if (value === 0) {
    // 0 => 0
    return "0";
  } else if (Math.abs(value) < DISPLAY_COMPACT_DECIMALS_CUTOFF) {
    // 0.1 => 0.1
    return PRECISION_NUMBER_FORMATTER(value).replace(/\.?0+$/, "");
  } else {
    // 1 => 1
    // 1000 => 1K
    return Humanize.compactInteger(Math.round(value), 1);
  }
}

// replaces the decimal and grouping separators with those specified by a NumberSeparators option
function replaceNumberSeparators(formatted: any, separators: any) {
  const [decimalSeparator, groupingSeparator] = (separators || ".,").split("");

  const separatorMap = {
    ",": groupingSeparator || "",
    ".": decimalSeparator,
  };

  return formatted.replace(
    /,|\./g,
    (separator: "." | ",") => separatorMap[separator],
  );
}

function formatNumberScientific(
  value: number,
  options: FormatNumberOptionsType,
) {
  if (options.maximumFractionDigits) {
    value = d3.round(value, options.maximumFractionDigits);
  }
  const exp = replaceNumberSeparators(
    value.toExponential(options.minimumFractionDigits),
    options?.number_separators,
  );
  if (options.jsx) {
    const [m, n] = exp.split("e");
    return (
      <span>
        {m}×10<sup>{n.replace(/^\+/, "")}</sup>
      </span>
    );
  } else {
    return exp;
  }
}
