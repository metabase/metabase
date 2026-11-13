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
 * Navigates the router when `path` or `navigationRequest` changes, and calls
 * `onPathChange` for every other change of the app's page.
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
  // True while the router follows the host's `path`, so the host is not told about its own navigation.
  const isNavigatingToHostPathRef = useRef(false);

  useEffect(() => {
    if (!onPathChange) {
      return;
    }

    return subscribeToDataAppRouting(() => {
      const currentPath = getCurrentDataAppPath(slug);

      if (!isNavigatingToHostPathRef.current && currentPath !== null) {
        onPathChange(currentPath);
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
  // It is not part of the app's path. `delete` re-encodes the whole query,
  // so only call it when the parameter is there.
  if (url.searchParams.has(EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME)) {
    url.searchParams.delete(EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME);
  }

  return url;
}

/**
 * The current location in the same format as the host's `path`,
 * or `null` when the router left this app.
 */
function getCurrentDataAppPath(slug: string): string | null {
  const basename = getBasename();

  if (!basename.endsWith(`/${slug}`)) {
    return null;
  }

  const { pathname, search, hash } = getCurrentUrl();
  const route = pathname.slice(basename.length);

  // The host's `path` for the app root is the bare slug.
  return `${slug}${route === "/" ? "" : route}${search}${hash}`;
}
