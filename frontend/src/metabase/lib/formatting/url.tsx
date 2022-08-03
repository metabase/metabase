import React from "react";

import ExternalLink from "metabase/core/components/ExternalLink";
import { renderLinkTextForClick, renderLinkURLForClick } from "./link";
import { getDataFromClicked } from "metabase/lib/click-behavior";
import { formatValue, getRemappedValue } from "./value";
import { isURL } from "metabase/lib/schema_metadata";

interface FormatUrlOptionsType {
  clicked?: any;
  column?: any;
  jsx?: boolean;
  link_text?: string;
  link_url?: string;
  remap?: any;
  rich?: boolean;
  view_as?: string;
}

function isSafeProtocol(protocol: string) {
  return (
    protocol !== "javascript:" && protocol !== "data:" && protocol !== "file:"
  );
}

function isDefaultLinkProtocol(protocol: string) {
  return (
    protocol === "http:" || protocol === "https:" || protocol === "mailto:"
  );
}

export function getUrlProtocol(url: URL) {
  try {
    const { protocol } = new URL(url);
    return protocol;
  } catch (e) {
    return undefined;
  }
}

export function formatUrl(value: URL, options: FormatUrlOptionsType = {}) {
  const { jsx, rich } = options;

  const url = getLinkUrl(value, options);

  if (jsx && rich && url) {
    const text = getLinkText(value, options);
    return (
      <ExternalLink className="link link--wrappable" href={url}>
        {text}
      </ExternalLink>
    );
  } else {
    return value;
  }
}

function getLinkText(value: URL, options: FormatUrlOptionsType) {
  const { view_as, link_text, clicked } = options;

  const isExplicitLink = view_as === "link";
  const hasCustomizedText = link_text && clicked;

  if (isExplicitLink && hasCustomizedText) {
    return renderLinkTextForClick(link_text, getDataFromClicked(clicked));
  }

  return (
    getRemappedValue(value, options) ||
    formatValue(value, { ...options, view_as: null })
  );
}

function getLinkUrl(
  value: URL,
  { view_as, link_url, clicked, column }: FormatUrlOptionsType,
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

export function slugify(name: string) {
  return name && encodeURIComponent(name.toLowerCase().replace(/\s/g, "_"));
}
