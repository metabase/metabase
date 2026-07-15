import { removeNewLines } from "metabase/utils/formatting/strings";
import { isURL } from "metabase-lib/v1/types/utils/isa";
import type { ColumnSettings } from "metabase-types/api";

import { getDataFromClicked } from "./click-data";
import { renderLinkTextForClick, renderLinkURLForClick } from "./link";
import { getJsxLinkRenderer } from "./registry";
import { formatValue, getRemappedValue } from "./value";

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
  try {
    const { protocol } = new URL(url);
    return protocol;
  } catch (e) {
    return undefined;
  }
}

export function formatUrl(value: string, options: ColumnSettings = {}) {
  const { jsx, rich, column, collapseNewlines } = options;

  const url = getLinkUrl(value, options);

  const jsxLinkRenderer = getJsxLinkRenderer();
  if (jsx && rich && url && jsxLinkRenderer) {
    const text = getLinkText(value, options);
    return jsxLinkRenderer(url, text);
  } else if (!url && !isURL(column)) {
    // Even when no URL is found, return a formatted value
    return formatValue(value, { ...options, view_as: null });
  } else {
    return collapseNewlines ? removeNewLines(value) : value;
  }
}

function getLinkText(value: string, options: ColumnSettings) {
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
  value: string,
  { view_as, link_url, clicked, column }: ColumnSettings,
) {
  const isExplicitLink = view_as === "link";
  const hasCustomizedUrl = link_url && clicked;

  if (isExplicitLink && hasCustomizedUrl) {
    return renderLinkURLForClick(link_url, getDataFromClicked(clicked));
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

  if (view_as === undefined && (isURL(column) || isDefaultProtocol)) {
    return value;
  }

  return null;
}

