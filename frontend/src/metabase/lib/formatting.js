/* @flow */

import d3 from "d3";
import inflection from "inflection";
import moment from "moment";
import Humanize from "humanize-plus";
import React from "react";
import { ngettext, msgid } from "c-3po";

import Mustache from "mustache";
import ReactMarkdown from "react-markdown";

import ExternalLink from "metabase/components/ExternalLink.jsx";

import {
  isDate,
  isNumber,
  isCoordinate,
  isLatitude,
  isLongitude,
} from "metabase/lib/schema_metadata";
import { isa, TYPE } from "metabase/lib/types";
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

import Field from "metabase-lib/lib/metadata/Field";
import type { Column, Value } from "metabase/meta/types/Dataset";
import type { DatetimeUnit } from "metabase/meta/types/Query";
import type { Moment } from "metabase/meta/types";

import type {
  DateStyle,
  TimeStyle,
  TimeEnabled,
} from "metabase/lib/formatting/date";

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
  view_as?: "link" | "email_link" | "image",
  link_text?: string,
  // DATE/TIME
  // date/timeout style string that is used to derive a date_format or time_format for different units, see metabase/lib/formatting/date
  date_style?: DateStyle,
  date_separator?: DateSeparator,
  date_abbreviate?: boolean,
  date_format?: string,
  time_style?: TimeStyle,
  time_enabled?: TimeEnabled,
  time_format?: string,
};

type FormattedString = string | React$Element<any>;

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

const PRECISION_NUMBER_FORMATTER = d3.format(".2r");
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
const NUMBER_REGEX = /[\+\-]?[0-9\., ]+/;

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
    return formatNumberCompact(number);
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
          formatted = match[0].trim();
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

function formatNumberCompact(value: number) {
  if (value === 0) {
    // 0 => 0
    return "0";
  } else if (value >= -0.01 && value <= 0.01) {
    // 0.01 => ~0
    return "~ 0";
  } else if (value > -1 && value < 1) {
    // 0.1 => 0.1
    return PRECISION_NUMBER_FORMATTER(value).replace(/\.?0+$/, "");
  } else {
    // 1 => 1
    // 1000 => 1K
    return Humanize.compactInteger(value, 1);
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
  let m = parseTimestamp(value, unit);
  if (!m.isValid()) {
    return String(value);
  }

  // Tooltips should show full month name, but condense "MMMM D, YYYY - MMMM D, YYYY" to "MMMM D - D, YYYY" etc
  const monthFormat =
    options.type === "tooltip" ? "MMMM" : getMonthFormat(options);
  const condensed = options.compact || options.type === "tooltip";

  const start = m.clone().startOf(unit);
  const end = m.clone().endOf(unit);
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
  let m = parseTimestamp(value, options.column && options.column.unit);
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
  let m = parseTimestamp(value, options.column && options.column.unit);
  if (!m.isValid()) {
    return String(value);
  }

  if (options.date_format || options.time_format) {
    formatDateTimeWithFormats(
      value,
      options.date_format,
      options.time_format,
      options,
    );
  } else {
    if (options.time_enabled === false) {
      return m.format(options.date_abbreviate ? "ll" : "LL");
    } else {
      return m.format(options.date_abbreviate ? "llll" : "LLLL");
    }
  }
}

export function formatDateTimeWithUnit(
  value: Value,
  unit: DatetimeUnit,
  options: FormattingOptions = {},
) {
  let m = parseTimestamp(value, unit);
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
  let m = parseTime(value);
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

// based on https://github.com/angular/angular.js/blob/v1.6.3/src/ng/directive/input.js#L25
const URL_WHITELIST_REGEX = /^(https?|mailto):\/*(?:[^:@]+(?::[^@]+)?@)?(?:[^\s:/?#]+|\[[a-f\d:]+])(?::\d+)?(?:\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i;

export function formatUrl(
  value: Value,
  { jsx, rich, view_as = "auto", link_text }: FormattingOptions = {},
) {
  const url = String(value);
  if (
    jsx &&
    rich &&
    (view_as === "link" || view_as === "auto") &&
    URL_WHITELIST_REGEX.test(url)
  ) {
    return (
      <ExternalLink className="link link--wrappable" href={url}>
        {link_text || url}
      </ExternalLink>
    );
  } else {
    return url;
  }
}

export function formatImage(
  value: Value,
  { jsx, rich, view_as = "auto", link_text }: FormattingOptions = {},
) {
  const url = String(value);
  if (jsx && rich && view_as === "image" && URL_WHITELIST_REGEX.test(url)) {
    return <img src={url} style={{ height: 30 }} />;
  } else {
    return url;
  }
}

// fallback for formatting a string without a column special_type
function formatStringFallback(value: Value, options: FormattingOptions = {}) {
  value = formatUrl(value, options);
  if (typeof value === "string") {
    value = formatEmail(value, options);
  }
  if (typeof value === "string") {
    value = formatImage(value, options);
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

export function formatValueRaw(value: Value, options: FormattingOptions = {}) {
  let column = options.column;

  options = {
    jsx: false,
    remap: true,
    ...options,
  };

  if (options.remap && column) {
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

  if (value == undefined) {
    return null;
  } else if (column && isa(column.special_type, TYPE.URL)) {
    return formatUrl(value, options);
  } else if (column && isa(column.special_type, TYPE.Email)) {
    return formatEmail(value, options);
  } else if (column && isa(column.base_type, TYPE.Time)) {
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
    return formatStringFallback(value, options);
  } else if (typeof value === "number" && isCoordinate(column)) {
    const range = rangeForValue(value, options.column);
    if (range && !options.noRange) {
      return formatRange(range, formatCoordinate, options);
    } else {
      return formatCoordinate(value, options);
    }
  } else if (typeof value === "number" && isNumber(column)) {
    const range = rangeForValue(value, options.column);
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

export function duration(milliseconds: number) {
  if (milliseconds < 60000) {
    let seconds = Math.round(milliseconds / 1000);
    return ngettext(msgid`${seconds} second`, `${seconds} seconds`, seconds);
  } else {
    let minutes = Math.round(milliseconds / 1000 / 60);
    return ngettext(msgid`${minutes} minute`, `${minutes} minutes`, minutes);
  }
}

// Removes trailing "id" from field names
export function stripId(name: string) {
  return name && name.replace(/ id$/i, "").trim();
}

export function slugify(name: string) {
  return name && name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
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
  let assignments = {};

  const currentUserColor = colorClasses[0];
  const otherUserColors = colorClasses.slice(1);
  let otherUserColorIndex = 0;

  for (let userId of userIds) {
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
