import ExternalLink from "metabase/core/components/ExternalLink";
import { getDataFromClicked } from "metabase-lib/parameters/utils/click-behavior";
import { isURL } from "metabase-lib/types/utils/isa";
import { renderLinkTextForClick, renderLinkURLForClick } from "./link";
import { formatValue, getRemappedValue } from "./value";

import type { OptionsType } from "./types";

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

export function getUrlProtocol(url: string) {
  try {
    const { protocol } = new URL(url);
    return protocol;
  } catch (e) {
    return undefined;
  }
}

export function formatUrl(value: string, options: OptionsType = {}) {
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

function getLinkText(value: string, options: OptionsType) {
  const { view_as, link_text, clicked } = options;

  const isExplicitLink = view_as === "link";
  const hasCustomizedText = link_text && clicked;

  if (isExplicitLink && hasCustomizedText) {
    return renderLinkTextForClick(
      link_text,
      getDataFromClicked(clicked) as any,
    );
  }

  return (
    getRemappedValue(value, options) ||
    formatValue(value, { ...options, view_as: null })
  );
}

function getLinkUrl(
  value: string,
  { view_as, link_url, clicked, column }: OptionsType,
) {
  const isExplicitLink = view_as === "link";
  const hasCustomizedUrl = link_url && clicked;

  if (isExplicitLink && hasCustomizedUrl) {
    return renderLinkURLForClick(link_url, getDataFromClicked(clicked) as any);
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
