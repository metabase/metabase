import cx from "classnames";

import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/env";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";
import { getDataFromClicked } from "metabase-lib/v1/parameters/utils/click-behavior";
import { isURL } from "metabase-lib/v1/types/utils/isa";

import { renderLinkTextForClick, renderLinkURLForClick } from "./link";
import type { OptionsType } from "./types";
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

export function formatUrl(value: string, options: OptionsType = {}) {
  const { jsx, rich } = options;

  const url = getLinkUrl(value, options);
  const text = getLinkText(value, options);

  if (jsx && rich && url) {
    const className = cx(CS.link, CS.linkWrappable);

    // (metabase#51099) prevent url from being rendered as a link when in sdk
    if (isEmbeddingSdk) {
      return url;
    }

    if (isSameOrSiteUrlOrigin(url)) {
      return (
        <Link className={className} to={url}>
          {text}
        </Link>
      );
    }
    return (
      <ExternalLink className={className} href={url}>
        {text}
      </ExternalLink>
    );
  } else {
    // Even when no URL is found, return the formatted text value
    // rather than the raw value to preserve other formatting options
    return text;
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
    formatValue(value, {
      ...options,
      view_as: null,
    })
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
