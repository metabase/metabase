import dayjs from "dayjs";
import Humanize from "humanize-plus";
import type { ReactNode } from "react";

import { COMPACT_CURRENCY_OPTIONS, getCurrencySymbol } from "./currency";

const DISPLAY_COMPACT_DECIMALS_CUTOFF = 1000;

const FIXED_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PRECISION_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

type FormatNumberOptions = {
  _numberFormatter?: Intl.NumberFormat;
  compact?: boolean;
  currency?: string;
  currency_in_header?: boolean;
  currency_style?: string;
  decimals?: string | number;
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
};

type FormatNumberJsxOptions = FormatNumberOptions & {
  jsx?: boolean;
};

type DefaultFormatNumberOptions = {
  compact: boolean;
  maximumFractionDigits: number;
  minimumFractionDigits?: number;
};

const DEFAULT_NUMBER_OPTIONS: DefaultFormatNumberOptions = {
  compact: false,
  maximumFractionDigits: 2,
};

// for extracting number portion from a formatted currency string
//
// NOTE: match minus/plus and number separately to handle interposed currency symbol -$1.23
const NUMBER_REGEX = /([+\-])?[^0-9]*([0-9., ]+)/;

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
  number: number | bigint,
  options?: FormatNumberOptions,
): string;
export function formatNumber(
  number: number | bigint,
  options: FormatNumberJsxOptions = {},
): string | ReactNode {
  options = { ...getDefaultNumberOptions(options), ...options };

  if (typeof options.scale === "number" && !isNaN(options.scale)) {
    number = multiply(number, options.scale);
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
  } else if (options.number_style === "duration") {
    return formatDuration(number, options);
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
      if (options["currency"] && options["currency_style"] === "symbol") {
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
      return FIXED_NUMBER_FORMATTER.format(number);
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

export function numberFormatterForOptions(options: FormatNumberOptions) {
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
  });
}

function formatNumberCompact(
  value: number | bigint,
  options: FormatNumberJsxOptions,
): string | ReactNode {
  if (options.number_style === "percent") {
    return _formatNumberCompact(multiply(value, 100), options) + "%";
  }
  if (options.number_style === "currency") {
    try {
      const nf = numberFormatterForOptions({
        ...options,
        ...COMPACT_CURRENCY_OPTIONS,
      });

      if (abs(value) < DISPLAY_COMPACT_DECIMALS_CUTOFF) {
        return nf.format(value);
      }
      const { value: currency } = nf
        .formatToParts(value)
        .find((p: any) => p.type === "currency") ?? { value: "" };

      const valueSign = value < 0 ? "-" : "";

      return valueSign + currency + _formatNumberCompact(abs(value), options);
    } catch (e) {
      // Intl.NumberFormat failed, so we fall back to a non-currency number
      return _formatNumberCompact(value, options);
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
  return _formatNumberCompact(value, options);
}

function _formatNumberCompact(
  value: number | bigint,
  options: FormatNumberOptions = {},
): string {
  if (value === 0 || value === 0n) {
    // 0 => 0
    return "0";
  }

  let formatted;
  if (abs(value) < DISPLAY_COMPACT_DECIMALS_CUTOFF) {
    // 0.1 => 0.1
    formatted = PRECISION_NUMBER_FORMATTER.format(value);
  } else if (typeof value === "number") {
    // 1 => 1
    // 1000 => 1K
    const isDefaultDecimalCount =
      options.maximumFractionDigits ===
      DEFAULT_NUMBER_OPTIONS.maximumFractionDigits;
    formatted = Humanize.compactInteger(
      Math.round(value),
      isDefaultDecimalCount ? 1 : options.maximumFractionDigits,
    );
  } else {
    formatted = PRECISION_NUMBER_FORMATTER.format(value);
  }

  return options?.number_separators !== DEFAULT_NUMBER_SEPARATORS
    ? replaceNumberSeparators(formatted, options?.number_separators)
    : formatted;
}

// replaces the decimal and grouping separators with those specified by a NumberSeparators option
function replaceNumberSeparators(formatted: any, separators: any) {
  const [decimalSeparator, groupingSeparator] = (separators || ".,").split("");

  const separatorMap = {
    ",": groupingSeparator || "",
    ".": decimalSeparator,
  };

  return formatted.replace(
    /[,.]/g,
    (separator: "." | ",") => separatorMap[separator],
  );
}

function formatNumberScientific(
  value: number | bigint,
  options: FormatNumberJsxOptions,
): string | ReactNode {
  if (typeof value === "bigint") {
    value = Number(value);
  } else if (options.maximumFractionDigits) {
    value = roundFloat(value, options.maximumFractionDigits);
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

function formatDuration(
  value: number | bigint,
  _options: FormatNumberOptions,
): string {
  const duration = dayjs.duration(Number(value));
  let str = "";

  if (duration.days() > 0) {
    str += `${duration.days()}d `;
  }

  if (duration.hours() > 0) {
    str += `${duration.hours()}h `;
  }

  if (duration.minutes() > 0) {
    str += `${duration.minutes()}m `;
  }

  if (duration.seconds() > 0) {
    str += `${duration.seconds()}s `;
  }

  return str.trim();
}

/**
 * Rounds a floating-point number to the specified number of decimal places.
 */
export function roundFloat(
  value: number,
  decimalPlaces: number = DEFAULT_NUMBER_OPTIONS.maximumFractionDigits,
): number {
  const factor = Math.pow(10, decimalPlaces);

  return Math.round(value * factor) / factor;
}

function abs(a: number | bigint) {
  return a < 0 ? -a : a;
}

function multiply(a: number | bigint, b: number) {
  return typeof a === "bigint" ? a * BigInt(b) : a * b;
}
