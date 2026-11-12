import { useEffect, useRef } from "react";

import {
  getBasename,
  navigate,
  subscribeToDataAppRouting,
} from "embedding-sdk-package/lib/private/data-app-routing";
import {
  getDataAppEmbedUrl,
  normalizeDataAppPath,
} from "embedding-sdk-shared/lib/embedded-data-app-path";
import { getCurrentMetabaseInstanceUrl } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";
import type { SdkIframeEmbedNavigateToDataAppPathMessage } from "metabase/embedding/embedding-iframe-sdk/types/embed";

/**
 * Keeps the data app router and the host's `path` in sync.
 *
 * Navigates the router when the `path` prop changes, and calls
 * `onPathChange` when the user navigates inside the app.
 **/
export function useDataAppPathNavigation({
  slug,
  path,
  navigationRequest = null,
  onPathChange,
}: {
  slug: string;
  path: string;
  navigationRequest?: SdkIframeEmbedNavigateToDataAppPathMessage["data"] | null;
  onPathChange?: (path: string) => void;
}) {
  // The host already knows about the paths it navigates to.
  const isNavigatingToHostPathRef = useRef(false);

  useEffect(() => {
    if (!onPathChange) {
      return;
    }

    return subscribeToDataAppRouting(() => {
      if (!isNavigatingToHostPathRef.current) {
        onPathChange(getCurrentDataAppPath(slug));
      }
    });
  }, [slug, onPathChange]);

  useEffect(() => {
    const currentUrl = getCurrentUrl();
    const normalizedPath = normalizeDataAppPath(path);

    const targetUrl = getDataAppEmbedUrl(
      getCurrentMetabaseInstanceUrl(),
      normalizedPath,
    );

    if (currentUrl.href !== targetUrl.href) {
      const route = normalizedPath.slice(slug.length);

      isNavigatingToHostPathRef.current = true;

      try {
        navigate(route.startsWith("/") ? route : `/${route}`, {
          replace: true,
        });
      } finally {
        isNavigatingToHostPathRef.current = false;
      }
    }
  }, [slug, path, navigationRequest]);
}

function getCurrentUrl(): URL {
  const url = new URL(window.location.href);

  // Added by embed.js for loading iframes in parallel.
  // It is not part of the app's path.
  url.searchParams.delete(EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME);

  return url;
}

/** The current location in the same format as the host's `path`. */
function getCurrentDataAppPath(slug: string): string {
  const { pathname, search, hash } = getCurrentUrl();
  const route = pathname.slice(getBasename().length);

  return `${slug}${route}${search}${hash}`;
}
