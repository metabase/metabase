import cx from "classnames";
import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import Mustache from "mustache";
import type * as React from "react";
import ReactMarkdown from "react-markdown";

import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { renderLinkTextForClick } from "metabase/lib/formatting/link";
import {
  clickBehaviorIsValid,
  getDataFromClicked,
} from "metabase-lib/v1/parameters/utils/click-behavior";
import { rangeForValue } from "metabase-lib/v1/queries/utils/range-for-value";
import {
  isBoolean,
  isCoordinate,
  isDate,
  isEmail,
  isNumber,
  isTime,
  isURL,
} from "metabase-lib/v1/types/utils/isa";

import { formatDateTimeWithUnit, formatRange } from "./date";
import { formatEmail } from "./email";
import { formatCoordinate } from "./geography";
import { formatImage } from "./image";
import { formatNumber } from "./numbers";
import { formatTime } from "./time";
import type { OptionsType } from "./types";
import { formatUrl } from "./url";

const MARKDOWN_RENDERERS = {
  a: ({ href, children }: any) => (
    <ExternalLink href={href}>{children}</ExternalLink>
  ),
};

export function formatValue(value: unknown, _options: OptionsType = {}) {
  let { prefix, suffix, ...options } = _options;
  // avoid rendering <ExternalLink> if we have click_behavior set
  if (
    options.click_behavior &&
    clickBehaviorIsValid(options.click_behavior) &&
    options.view_as !== "image" // images don't conflict with click behavior
  ) {
    options = {
      ...options,
      view_as: null, // turns off any link rendering
    };
  }
  const formatted = formatValueRaw(value, options);
  let maybeJson = {};
  try {
    maybeJson = JSON.parse(value as string);
  } catch {
    // do nothing
  }
  if (options.markdown_template) {
    if (options.jsx) {
      // inject the formatted value as "value" and the unformatted value as "raw"
      const markdown = Mustache.render(options.markdown_template, {
        value: formatted,
        raw: value,
        json: maybeJson,
      });
      return (
        <ReactMarkdown components={MARKDOWN_RENDERERS}>
          {markdown}
        </ReactMarkdown>
      );
    } else {
      // FIXME: render and get the innerText?
      console.warn(
        "formatValue: options.markdown_template not supported when options.jsx = false",
      );
      return formatted;
    }
  }
  if (prefix || suffix) {
    if (options.jsx && typeof formatted !== "string") {
      return (
        <span>
          {prefix || ""}
          {formatted}
          {suffix || ""}
        </span>
      );
    } else {
      return `${prefix || ""}${formatted}${suffix || ""}`;
    }
  } else {
    return formatted;
  }
}

export function getRemappedValue(
  value: string | number,
  { remap, column }: OptionsType = {},
) {
  if (remap && column) {
    if (column.hasRemappedValue && column.hasRemappedValue(value)) {
      return column.remappedValue(value);
    }
    // or it may be a raw column object with a "remapping" object
    if (column.remapping instanceof Map && column.remapping.has(value)) {
      return column.remapping.get(value);
    }
    // TODO: get rid of one of these two code paths?
  }
}

// fallback for formatting a string without a column semantic_type
function formatStringFallback(value: any, options: OptionsType = {}) {
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

export function formatValueRaw(
  value: unknown,
  options: OptionsType = {},
): React.ReactElement | Moment | string | number | null {
  options = {
    jsx: false,
    remap: true,
    ...options,
  };

  const { column } = options;

  const remapped = getRemappedValue(value as string | number, options);
  if (remapped !== undefined && options.view_as !== "link") {
    return remapped;
  }

  if (value == null) {
    return options.stringifyNull ? NULL_DISPLAY_VALUE : null;
  } else if (
    options.view_as !== "image" &&
    options.click_behavior &&
    clickBehaviorIsValid(options.click_behavior) &&
    options.jsx
  ) {
    // Style this like a link if we're in a jsx context.
    // It's not actually a link since we handle the click differently for dashboard and question targets.
    return (
      <div
        data-testid="link-formatted-text"
        className={cx(CS.link, CS.linkWrappable)}
      >
        {formatValueRaw(value, { ...options, jsx: false })}
      </div>
    );
  } else if (
    options.click_behavior &&
    options.click_behavior.linkTextTemplate
  ) {
    return renderLinkTextForClick(
      options.click_behavior.linkTextTemplate,
      getDataFromClicked(options.clicked) as any,
    );
  } else if (
    (isURL(column) && options.view_as == null) ||
    options.view_as === "link"
  ) {
    return formatUrl(value as string, options);
  } else if (isEmail(column)) {
    return formatEmail(value as string, options);
  } else if (isTime(column)) {
    return formatTime(value as Moment, column.unit, options);
  } else if (column && column.unit != null) {
    return formatDateTimeWithUnit(
      value as string | number,
      column.unit,
      options,
    );
  } else if (
    isDate(column) ||
    moment.isDate(value) ||
    moment.isMoment(value) ||
    moment(value as string, ["YYYY-MM-DD'T'HH:mm:ss.SSSZ"], true).isValid()
  ) {
    return formatDateTimeWithUnit(value as string | number, "minute", options);
  } else if (typeof value === "string") {
    if (options.view_as === "image") {
      return formatImage(value, options);
    }
    if (column?.semantic_type) {
      return value;
    }
    return formatStringFallback(value, options);
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
  } else if (typeof value === "boolean" && isBoolean(column)) {
    return JSON.stringify(value);
  } else if (typeof value === "object") {
    // no extra whitespace for table cells
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}
