import { removeNewLines } from "metabase/utils/formatting";
import type { ColumnSettings } from "metabase-types/api";

import { getDataFromClicked } from "./click-data";
import { renderLinkTextForClick, renderLinkURLForClick } from "./link";
import { getJsxLinkRenderer } from "./registry";
import {
  type FormatValueOptions,
  formatValue,
  getColumnTypePredicates,
  getRemappedValue,
} from "./value";

function isSafeProtocol(protocol: string) {
  return (
    protocol !== "javascript:" && protocol !== "data:" && protocol !== "file:"
  );
}

export function isDefaultLinkProtocol(protocol: string) {
  return (
    protocol === "http:" || protocol === "https:" || protocol === "mailto:"
  );
}

export function getUrlProtocol(url: string) {
  if (!url.includes(":")) {
    return undefined;
  }
  try {
    const { protocol } = new URL(url);
    return protocol;
  } catch (e) {
    return undefined;
  }
}

export function formatUrl(
  value: unknown,
  options: FormatValueOptions = {},
): React.ReactElement | string | number | null {
  const { jsx, rich, column, collapseNewlines, copyLinkUrl } = options;

  const url = getLinkUrl(value, options);

  const jsxLinkRenderer = getJsxLinkRenderer();
  if (jsx && rich && url && jsxLinkRenderer) {
    const text = getLinkText(value, options);
    return jsxLinkRenderer(url, text);
  } else if (url && copyLinkUrl) {
    return url;
  } else if (!url && !getColumnTypePredicates(column).isURL) {
    // Even when no URL is found, return a formatted value
    return formatValue(value, { ...options, view_as: null });
  } else {
    const text = collapseNewlines ? removeNewLines(value) : value;
    return typeof text === "string" || typeof text === "number" || text === null
      ? text
      : String(text);
  }
}

function getLinkText(value: unknown, options: ColumnSettings) {
  const { view_as, link_text, clicked, collapseNewlines } = options;

  const isExplicitLink = view_as === "link";
  const hasCustomizedText = link_text && clicked;

  let text;
  if (isExplicitLink && hasCustomizedText) {
    text = renderLinkTextForClick(link_text, getDataFromClicked(clicked));
  } else {
    text =
      getRemappedValue(value, options) ||
      formatValue(value, { ...options, view_as: null });
  }

  return collapseNewlines ? removeNewLines(text) : text;
}

function getLinkUrl(
  value: unknown,
  { view_as, link_url, clicked, column }: ColumnSettings,
) {
  const isExplicitLink = view_as === "link";
  const hasCustomizedUrl = link_url && clicked;

  if (isExplicitLink && hasCustomizedUrl) {
    return renderLinkURLForClick(link_url, getDataFromClicked(clicked));
  }

  if (typeof value !== "string") {
    return null;
  }

  const protocol = getUrlProtocol(value);
  const isValueSafeLink = protocol && isSafeProtocol(protocol);

  if (!isValueSafeLink) {
    return null;
  }

  if (isExplicitLink) {
    return value;
  }

  const isDefaultProtocol = protocol && isDefaultLinkProtocol(protocol);
  const isMaybeLink = view_as === "auto";

  if (isMaybeLink && isDefaultProtocol) {
    return value;
  }

  if (
    view_as === undefined &&
    (getColumnTypePredicates(column).isURL || isDefaultProtocol)
  ) {
    return value;
  }

  return null;
}
