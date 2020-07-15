/* @flow */

import d3 from "d3";
import inflection from "inflection";
import moment from "moment";
import Humanize from "humanize-plus";
import React from "react";
import { ngettext, msgid } from "ttag";

import Mustache from "mustache";
import ReactMarkdown from "react-markdown";

import ExternalLink from "metabase/components/ExternalLink";

import {
  isDate,
  isNumber,
  isCoordinate,
  isLatitude,
  isLongitude,
  isTime,
  isURL,
  isEmail,
} from "metabase/lib/schema_metadata";
import { parseTimestamp, parseTime } from "metabase/lib/time";
import { rangeForValue } from "metabase/lib/dataset";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { decimalCount } from "metabase/visualizations/lib/numeric";

import {
  DEFAULT_DATE_STYLE,
  getDateFormatFromStyle,
  DEFAULT_TIME_STYLE,
  getTimeFormatFromStyle,
  hasHour,
} from "metabase/lib/formatting/date";
import { PLUGIN_FORMATTING_HELPERS } from "metabase/plugins";

import type Field from "metabase-lib/lib/metadata/Field";
import type { Column, Value } from "metabase-types/types/Dataset";
import type { DatetimeUnit } from "metabase-types/types/Query";
import type { Moment } from "metabase-types/types";

import type {
  DateStyle,
  TimeStyle,
  TimeEnabled,
} from "metabase/lib/formatting/date";
import type { ClickObject } from "metabase-types/types/Visualization";

// a one or two character string specifying the decimal and grouping separator characters
export type NumberSeparators = ".," | ", " | ",." | ".";

// single character string specifying date separators
export type DateSeparator = "/" | "-" | ".";

export type FormattingOptions = {
  // GENERIC
  column?: Column | Field,
  majorWidth?: number,
  type?: "axis" | "cell" | "tooltip",
  jsx?: boolean,
  remap?: boolean,
  // render links for type/URLs, type/Email, etc
  rich?: boolean,
  compact?: boolean,
  // always format as the start value rather than the range, e.x. for bar histogram
  noRange?: boolean,
  // NUMBER
  // TODO: docoument these:
  number_style?: null | "decimal" | "percent" | "scientific" | "currency",
  prefix?: string,
  suffix?: string,
  scale?: number,
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString
  scale?: number,
  number_separators?: NumberSeparators,
  minimumFractionDigits?: number,
  maximumFractionDigits?: number,
  // decimals sets both minimumFractionDigits and maximumFractionDigits
  decimals?: number,
  // STRING
  view_as?: null | "link" | "email_link" | "image" | "auto",
  link_text?: string,
  link_template?: string,
  clicked?: ClickObject,
  // DATE/TIME
  // date/timeout style string that is used to derive a date_format or time_format for different units, see metabase/lib/formatting/date
  date_style?: DateStyle,
  date_separator?: DateSeparator,
  date_abbreviate?: boolean,
  date_format?: string,
  time_style?: TimeStyle,
  time_enabled?: TimeEnabled,
  time_format?: string,
  // display in local timezone or parsed timezone
  local?: boolean,
  // markdown template
  markdown_template?: string,
};

type FormattedString = string | React$Element<any>;

export const FK_SYMBOL = "→";

const DEFAULT_NUMBER_OPTIONS: FormattingOptions = {
  compact: false,
  maximumFractionDigits: 2,
};

function getDefaultNumberOptions(options) {
  const defaults = { ...DEFAULT_NUMBER_OPTIONS };

  // decimals sets the exact number of digits after the decimal place
  if (typeof options.decimals === "number" && !isNaN(options.decimals)) {
    defaults.minimumFractionDigits = options.decimals;
    defaults.maximumFractionDigits = options.decimals;
  }

  return defaults;
}

const PRECISION_NUMBER_FORMATTER = d3.format(".2f");
const FIXED_NUMBER_FORMATTER = d3.format(",.f");
const DECIMAL_DEGREES_FORMATTER = d3.format(".08f");
const DECIMAL_DEGREES_FORMATTER_COMPACT = d3.format(".02f");
const BINNING_DEGREES_FORMATTER = (value, binWidth) => {
  return d3.format(`.0${decimalCount(binWidth)}f`)(value);
};

const getMonthFormat = options =>
  options.compact || options.date_abbreviate ? "MMM" : "MMMM";
const getDayFormat = options =>
  options.compact || options.date_abbreviate ? "ddd" : "dddd";

// use en dashes, for Maz
const RANGE_SEPARATOR = ` – `;

// for extracting number portion from a formatted currency string
// NOTE: match minus/plus and number separately to handle interposed currency symbol -$1.23
const NUMBER_REGEX = /([\+\-])?[^0-9]*([0-9\., ]+)/;

const DEFAULT_NUMBER_SEPARATORS = ".,";

export function numberFormatterForOptions(options: FormattingOptions) {
  options = { ...getDefaultNumberOptions(options), ...options };
  // always use "en" locale so we have known number separators we can replace depending on number_separators option
  // TODO: if we do that how can we get localized currency names?
  // $FlowFixMe: doesn't know about Intl.NumberFormat
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

export function formatNumber(number: number, options: FormattingOptions = {}) {
  options = { ...getDefaultNumberOptions(options), ...options };

  if (typeof options.scale === "number" && !isNaN(options.scale)) {
    number = options.scale * number;
  }

  if (options.compact) {
    return formatNumberCompact(number, options);
  } else if (options.number_style === "scientific") {
    return formatNumberScientific(number, options);
  } else {
    try {
      let nf;
      if (number < 1 && number > -1 && options.decimals == null) {
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

// replaces the decimale and grouping separators with those specified by a NumberSeparators option
function replaceNumberSeparators(
  formatted: string,
  separators: NumberSeparators,
) {
  const [decimalSeparator, groupingSeparator] = (separators || ".,").split("");

  const separatorMap = {
    ",": groupingSeparator || "",
    ".": decimalSeparator,
  };

  return formatted.replace(/,|\./g, separator => separatorMap[separator]);
}

function formatNumberScientific(
  value: number,
  options: FormattingOptions,
): FormattedString {
  if (options.maximumFractionDigits) {
    value = d3.round(value, options.maximumFractionDigits);
  }
  const exp = value.toExponential(options.minimumFractionDigits);
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

const DISPLAY_COMPACT_DECIMALS_CUTOFF = 1000;
export const COMPACT_CURRENCY_OPTIONS = {
  // Currencies vary in how many decimals they display, so this is probably
  // wrong in some cases. Intl.NumberFormat has some of that data built-in, but
  // I couldn't figure out how to use it here.
  digits: 2,
  currency_style: "symbol",
};

function formatNumberCompact(value: number, options: FormattingOptions) {
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
        .find(p => p.type === "currency");
      return currency + formatNumberCompactWithoutOptions(value);
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

export function formatCoordinate(
  value: number,
  options: FormattingOptions = {},
) {
  const binWidth =
    options.column &&
    options.column.binning_info &&
    options.column.binning_info.bin_width;
  let direction = "";
  if (isLatitude(options.column)) {
    direction = " " + (value < 0 ? "S" : "N");
    value = Math.abs(value);
  } else if (isLongitude(options.column)) {
    direction = " " + (value < 0 ? "W" : "E");
    value = Math.abs(value);
  }

  const formattedValue = binWidth
    ? BINNING_DEGREES_FORMATTER(value, binWidth)
    : options.compact
    ? DECIMAL_DEGREES_FORMATTER_COMPACT(value)
    : DECIMAL_DEGREES_FORMATTER(value);
  return formattedValue + "°" + direction;
}

export function formatRange(
  range: [number, number],
  formatter: (value: number) => any,
  options: FormattingOptions = {},
) {
  const [start, end] = range.map(value => formatter(value, options));
  if ((options.jsx && typeof start !== "string") || typeof end !== "string") {
    return (
      <span>
        {start} {RANGE_SEPARATOR} {end}
      </span>
    );
  } else {
    return `${start} ${RANGE_SEPARATOR} ${end}`;
  }
}

function formatMajorMinor(major, minor, options = {}) {
  options = {
    jsx: false,
    majorWidth: 3,
    ...options,
  };
  if (options.jsx) {
    return (
      <span>
        <span
          style={{ minWidth: options.majorWidth + "em" }}
          className="inline-block text-right text-bold"
        >
          {major}
        </span>
        {" - "}
        <span>{minor}</span>
      </span>
    );
  } else {
    return `${major} - ${minor}`;
  }
}

/** This formats a time with unit as a date range */
export function formatDateTimeRangeWithUnit(
  value: Value,
  unit: DatetimeUnit,
  options: FormattingOptions = {},
) {
  const m = parseTimestamp(value, unit, options.local);
  if (!m.isValid()) {
    return String(value);
  }

  // Tooltips should show full month name, but condense "MMMM D, YYYY - MMMM D, YYYY" to "MMMM D - D, YYYY" etc
  const monthFormat =
    options.type === "tooltip" ? "MMMM" : getMonthFormat(options);
  const condensed = options.compact || options.type === "tooltip";

  // The startOf/endOf transition needs to happen in "en" rather than the
  // current locale. Other locales define week boundaries differently, and they
  // don't line up with the server's grouping logic.
  const start = m
    .clone()
    .locale("en")
    .startOf(unit)
    .locale(false);
  const end = m
    .clone()
    .locale("en")
    .endOf(unit)
    .locale(false);

  if (start.isValid() && end.isValid()) {
    if (!condensed || start.year() !== end.year()) {
      // January 1, 2018 - January 2, 2019
      return (
        start.format(`${monthFormat} D, YYYY`) +
        RANGE_SEPARATOR +
        end.format(`${monthFormat} D, YYYY`)
      );
    } else if (start.month() !== end.month()) {
      // January 1 - Feburary 2, 2018
      return (
        start.format(`${monthFormat} D`) +
        RANGE_SEPARATOR +
        end.format(`${monthFormat} D, YYYY`)
      );
    } else {
      // January 1 - 2, 2018
      return (
        start.format(`${monthFormat} D`) +
        RANGE_SEPARATOR +
        end.format(`D, YYYY`)
      );
    }
  } else {
    return formatWeek(m, options);
  }
}

function formatWeek(m: Moment, options: FormattingOptions = {}) {
  // force 'en' locale for now since our weeks currently always start on Sundays
  m = m.locale("en");
  return formatMajorMinor(m.format("wo"), m.format("gggg"), options);
}

function replaceDateFormatNames(format, options) {
  return format
    .replace(/\bMMMM\b/g, getMonthFormat(options))
    .replace(/\bdddd\b/g, getDayFormat(options));
}

function formatDateTimeWithFormats(value, dateFormat, timeFormat, options) {
  const m = parseTimestamp(
    value,
    options.column && options.column.unit,
    options.local,
  );
  if (!m.isValid()) {
    return String(value);
  }

  const format = [];
  if (dateFormat) {
    format.push(replaceDateFormatNames(dateFormat, options));
  }
  if (timeFormat && options.time_enabled) {
    format.push(timeFormat);
  }
  return m.format(format.join(", "));
}

function formatDateTime(value, options) {
  return formatDateTimeWithUnit(value, "minute", options);
}

export function formatDateTimeWithUnit(
  value: Value,
  unit: DatetimeUnit,
  options: FormattingOptions = {},
) {
  const m = parseTimestamp(value, unit, options.local);
  if (!m.isValid()) {
    return String(value);
  }

  // expand "week" into a range in specific contexts
  if (unit === "week") {
    if (
      (options.type === "tooltip" || options.type === "cell") &&
      !options.noRange
    ) {
      // tooltip show range like "January 1 - 7, 2017"
      return formatDateTimeRangeWithUnit(value, unit, options);
    }
  }

  options = {
    date_style: DEFAULT_DATE_STYLE,
    time_style: DEFAULT_TIME_STYLE,
    time_enabled: hasHour(unit) ? "minutes" : null,
    ...options,
  };

  let dateFormat = options.date_format;
  let timeFormat = options.time_format;

  if (!dateFormat) {
    dateFormat = getDateFormatFromStyle(
      // $FlowFixMe: date_style default set above
      options["date_style"],
      unit,
      options["date_separator"],
    );
  }

  if (!timeFormat) {
    timeFormat = getTimeFormatFromStyle(
      // $FlowFixMe: time_style default set above
      options.time_style,
      unit,
      options.time_enabled,
    );
  }

  return formatDateTimeWithFormats(value, dateFormat, timeFormat, options);
}

export function formatTime(value: Value) {
  const m = parseTime(value);
  if (!m.isValid()) {
    return String(value);
  } else {
    return m.format("LT");
  }
}

// https://github.com/angular/angular.js/blob/v1.6.3/src/ng/directive/input.js#L27
const EMAIL_WHITELIST_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(\.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

export function formatEmail(
  value: Value,
  // $FlowFixMe: unclear problem with `view_as` default
  { jsx, rich, view_as = "auto", link_text }: FormattingOptions = {},
) {
  const email = String(value);
  if (
    jsx &&
    rich &&
    (view_as === "email_link" || view_as === "auto") &&
    EMAIL_WHITELIST_REGEX.test(email)
  ) {
    return (
      <ExternalLink href={"mailto:" + email}>{link_text || email}</ExternalLink>
    );
  } else {
    return email;
  }
}

function getUrlProtocol(url) {
  try {
    const { protocol } = new URL(url);
    return protocol;
  } catch (e) {
    return undefined;
  }
}

function isSafeProtocol(protocol) {
  return (
    protocol !== "javascript:" && protocol !== "data:" && protocol !== "file:"
  );
}

function isDefaultLinkProtocol(protocol) {
  return (
    protocol === "http:" || protocol === "https:" || protocol === "mailto:"
  );
}

export function formatUrl(value: Value, options: FormattingOptions = {}) {
  const { jsx, rich, view_as, column } = options;
  const url = PLUGIN_FORMATTING_HELPERS.url(value, options);
  const protocol = getUrlProtocol(url);
  if (
    jsx &&
    rich &&
    protocol &&
    isSafeProtocol(protocol) &&
    (view_as === undefined
      ? isURL(column) || isDefaultLinkProtocol(protocol)
      : view_as === "link"
      ? true
      : view_as === "auto"
      ? isDefaultLinkProtocol(protocol)
      : false)
  ) {
    return (
      <ExternalLink className="link link--wrappable" href={url}>
        {PLUGIN_FORMATTING_HELPERS.urlText(value, options)}
      </ExternalLink>
    );
  } else {
    return url;
  }
}

export function formatImage(
  value: Value,
  // $FlowFixMe: unclear problem with `view_as` default
  { jsx, rich, view_as = "auto", link_text }: FormattingOptions = {},
) {
  const url = String(value);
  const protocol = getUrlProtocol(url);
  const acceptedProtocol = protocol === "http:" || protocol === "https:";
  if (jsx && rich && view_as === "image" && acceptedProtocol) {
    return <img src={url} style={{ height: 30 }} />;
  } else {
    return url;
  }
}

// fallback for formatting a string without a column special_type
function formatStringFallback(value: Value, options: FormattingOptions = {}) {
  if (options.view_as !== null) {
    value = formatUrl(value, options);
    if (typeof value === "string") {
      value = formatEmail(value, options);
    }
    if (typeof value === "string") {
      value = formatImage(value, options);
    }
  }
  return value;
}

const MARKDOWN_RENDERERS = {
  // eslint-disable-next-line react/display-name
  link: ({ href, children }) => (
    <ExternalLink href={href}>{children}</ExternalLink>
  ),
};

export function formatValue(value: Value, options: FormattingOptions = {}) {
  const formatted = formatValueRaw(value, options);
  if (options.markdown_template) {
    if (options.jsx) {
      // inject the formatted value as "value" and the unformatted value as "raw"
      const markdown = Mustache.render(options.markdown_template, {
        value: formatted,
        raw: value,
      });
      return <ReactMarkdown source={markdown} renderers={MARKDOWN_RENDERERS} />;
    } else {
      // FIXME: render and get the innerText?
      console.warn(
        "formatValue: options.markdown_template not supported when options.jsx = false",
      );
      return formatted;
    }
  }
  if (options.prefix || options.suffix) {
    if (options.jsx && typeof formatted !== "string") {
      return (
        <span>
          {options.prefix || ""}
          {formatted}
          {options.suffix || ""}
        </span>
      );
    } else {
      // $FlowFixMe: doesn't understand formatted is a string
      return `${options.prefix || ""}${formatted}${options.suffix || ""}`;
    }
  } else {
    return formatted;
  }
}

export function getRemappedValue(
  value: Value,
  { remap, column }: FormattingOptions = {},
): ?string {
  if (remap && column) {
    // $FlowFixMe: column could be Field or Column
    if (column.hasRemappedValue && column.hasRemappedValue(value)) {
      // $FlowFixMe: column could be Field or Column
      return column.remappedValue(value);
    }
    // or it may be a raw column object with a "remapping" object
    if (column.remapping instanceof Map && column.remapping.has(value)) {
      return column.remapping.get(value);
    }
    // TODO: get rid of one of these two code paths?
  }
}

export function formatValueRaw(value: Value, options: FormattingOptions = {}) {
  options = {
    jsx: false,
    remap: true,
    ...options,
  };

  const { column } = options;

  const remapped = getRemappedValue(value, options);
  if (remapped !== undefined && options.view_as !== "link") {
    return remapped;
  }

  if (value == null) {
    return null;
  } else if (
    (isURL(column) && options.view_as !== null) ||
    options.view_as === "link"
  ) {
    return formatUrl(value, options);
  } else if (isEmail(column)) {
    return formatEmail(value, options);
  } else if (isTime(column)) {
    return formatTime(value);
  } else if (column && column.unit != null) {
    return formatDateTimeWithUnit(value, column.unit, options);
  } else if (
    isDate(column) ||
    moment.isDate(value) ||
    moment.isMoment(value) ||
    moment(value, ["YYYY-MM-DD'T'HH:mm:ss.SSSZ"], true).isValid()
  ) {
    return formatDateTime(value, options);
  } else if (typeof value === "string") {
    if (column && column.special_type != null) {
      return value;
    } else {
      return formatStringFallback(value, options);
    }
  } else if (typeof value === "number" && isCoordinate(column)) {
    const range = rangeForValue(value, column);
    if (range && !options.noRange) {
      return formatRange(range, formatCoordinate, options);
    } else {
      return formatCoordinate(value, options);
    }
  } else if (typeof value === "number" && isNumber(column)) {
    const range = rangeForValue(value, column);
    if (range && !options.noRange) {
      return formatRange(range, formatNumber, options);
    } else {
      return formatNumber(value, options);
    }
  } else if (typeof value === "object") {
    // no extra whitespace for table cells
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

export function formatColumn(column: Column): string {
  if (!column) {
    return "";
  } else if (column.remapped_to_column != null) {
    // $FlowFixMe: remapped_to_column is a special field added by Visualization.jsx
    return formatColumn(column.remapped_to_column);
  } else {
    let columnTitle = getFriendlyName(column);
    if (column.unit && column.unit !== "default") {
      columnTitle += ": " + capitalize(column.unit.replace(/-/g, " "));
    }
    return columnTitle;
  }
}

export function formatField(field: Field): string {
  if (!field) {
    return "";
  } else if (field.dimensions && field.dimensions.name) {
    return field.dimensions.name;
  } else {
    return field.display_name || field.name;
  }
}

// $FlowFixMe
export function singularize(...args) {
  return inflection.singularize(...args);
}

// $FlowFixMe
export function pluralize(...args) {
  return inflection.pluralize(...args);
}

// $FlowFixMe
export function capitalize(...args) {
  return inflection.capitalize(...args);
}

// $FlowFixMe
export function inflect(...args) {
  return inflection.inflect(...args);
}

// $FlowFixMe
export function titleize(...args) {
  return inflection.titleize(...args);
}

// $FlowFixMe
export function humanize(...args) {
  return inflection.humanize(...args);
}

export function conjunct(list: string[], conjunction: string) {
  return (
    list.slice(0, -1).join(`, `) +
    (list.length > 2 ? `,` : ``) +
    (list.length > 1 ? ` ${conjunction} ` : ``) +
    (list[list.length - 1] || ``)
  );
}

export function duration(milliseconds: number) {
  if (milliseconds < 60000) {
    const seconds = Math.round(milliseconds / 1000);
    return ngettext(msgid`${seconds} second`, `${seconds} seconds`, seconds);
  } else {
    const minutes = Math.round(milliseconds / 1000 / 60);
    return ngettext(msgid`${minutes} minute`, `${minutes} minutes`, minutes);
  }
}

// Removes trailing "id" from field names
export function stripId(name: string) {
  return name && name.replace(/ id$/i, "").trim();
}

export function slugify(name: string) {
  return name && name.toLowerCase().replace(/[^a-z\u0400-\u04ff0-9_]/g, "_");
}

export function assignUserColors(
  userIds: number[],
  currentUserId: number,
  colorClasses: string[] = [
    "bg-brand",
    "bg-purple",
    "bg-error",
    "bg-green",
    "bg-gold",
    "bg-medium",
  ],
) {
  const assignments = {};

  const currentUserColor = colorClasses[0];
  const otherUserColors = colorClasses.slice(1);
  let otherUserColorIndex = 0;

  for (const userId of userIds) {
    if (!(userId in assignments)) {
      if (userId === currentUserId) {
        assignments[userId] = currentUserColor;
      } else if (userId != null) {
        assignments[userId] =
          otherUserColors[otherUserColorIndex++ % otherUserColors.length];
      }
    }
  }

  return assignments;
}

export function formatSQL(sql: string) {
  if (typeof sql === "string") {
    sql = sql.replace(/\sFROM/, "\nFROM");
    sql = sql.replace(/\sLEFT JOIN/, "\nLEFT JOIN");
    sql = sql.replace(/\sWHERE/, "\nWHERE");
    sql = sql.replace(/\sGROUP BY/, "\nGROUP BY");
    sql = sql.replace(/\sORDER BY/, "\nORDER BY");
    sql = sql.replace(/\sLIMIT/, "\nLIMIT");
    sql = sql.replace(/\sAND\s/, "\n   AND ");
    sql = sql.replace(/\sOR\s/, "\n    OR ");

    return sql;
  }
}
