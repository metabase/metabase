import cx from "classnames";

import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";
import { getDataFromClicked } from "metabase-lib/v1/parameters/utils/click-behavior";
import { isURL } from "metabase-lib/v1/types/utils/isa";

import { renderLinkTextForClick, renderLinkURLForClick } from "./link";
import { removeNewLines } from "./strings";
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
  const { jsx, rich, column, collapseNewlines } = options;

  const url = getLinkUrl(value, options);

  if (jsx && rich && url) {
    const text = getLinkText(value, options);
    const className = cx(CS.link, CS.linkWrappable);

    // on the react sdk we treat all user provided urls as external links
    if (isSameOrSiteUrlOrigin(url) && !isEmbeddingSdk()) {
      return (
        <Link className={className} to={url}>
          {text}
        </Link>
      );
    }

    const onClickCaptureInSdk = isEmbeddingSdk()
      ? {
          onClickCapture: async (e: React.MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault(); // Prevent immediately while we await the response
            const result = await handleLinkSdkPlugin(url);
            if (!result.handled) {
              // Parent didn't handle it - proceed with default navigation
              window.open(url, "_blank", "noopener");
            }
          },
        }
      : {};

    return (
      <ExternalLink className={className} href={url} {...onClickCaptureInSdk}>
        {text}
      </ExternalLink>
    );
  } else if (!url && !isURL(column)) {
    // Even when no URL is found, return a formatted value
    return formatValue(value, { ...options, view_as: null });
  } else {
    return collapseNewlines ? removeNewLines(value) : value;
  }
}

function getLinkText(value: string, options: OptionsType) {
  const { view_as, link_text, clicked, collapseNewlines } = options;

  const isExplicitLink = view_as === "link";
  const hasCustomizedText = link_text && clicked;

  let text;
  if (isExplicitLink && hasCustomizedText) {
    text = renderLinkTextForClick(
      link_text,
      getDataFromClicked(clicked) as any,
    );
  } else {
    text =
      getRemappedValue(value, options) ||
      formatValue(value, { ...options, view_as: null });
  }

  return collapseNewlines ? removeNewLines(text) : text;
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
