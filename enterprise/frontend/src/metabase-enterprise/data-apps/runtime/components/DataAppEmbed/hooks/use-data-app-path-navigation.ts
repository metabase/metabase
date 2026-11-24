import { useEffect, useRef } from "react";

import {
  getBasename,
  navigate,
  subscribeToDataAppRouting,
} from "embedding-sdk-package/data-apps/private/lib/data-app-routing";
import {
  getDataAppEmbedUrl,
  getEmbeddedAppSlugFromPath,
  normalizeDataAppPath,
} from "embedding-sdk-shared/data-apps/embedded-data-app-path";
import { getCurrentMetabaseInstanceUrl } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";
import type { SdkIframeEmbedNavigateToDataAppPathMessage } from "metabase/embedding/embedding-iframe-sdk/types/embed";

type NavigationRequest = SdkIframeEmbedNavigateToDataAppPathMessage["data"];

/**
 * Navigates the router to `navigationRequest` when set, otherwise to `path`.
 * Calls `onPathChange` for every other change of the app's page, with the ID of the last navigation request it handled.
 **/
export function useDataAppPathNavigation({
  slug,
  path,
  navigationRequest = null,
  onPathChange,
}: {
  slug: string;
  path: string;
  navigationRequest?: NavigationRequest | null;
  onPathChange: (path: string, navigationId: number | undefined) => void;
}) {
  // True while navigating to the host's `path`, so that navigation is not reported back through `onPathChange`.
  const isNavigatingToHostPathRef = useRef(false);

  // Lets the host drop a report sent before the iframe handled its latest navigation request.
  const navigationIdRef = useRef<number | undefined>(undefined);

  useEffect(
    () =>
      subscribeToDataAppRouting(() => {
        const currentPath = getCurrentDataAppPath(slug);

        if (!isNavigatingToHostPathRef.current && currentPath !== null) {
          onPathChange(currentPath, navigationIdRef.current);
        }
      }),
    [slug, onPathChange],
  );

  useEffect(() => {
    navigationIdRef.current = navigationRequest?.navigationId;

    const route = getHostPathRoute(
      slug,
      getRequestedPath(slug, path, navigationRequest),
    );

    if (route === null) {
      return;
    }

    isNavigatingToHostPathRef.current = true;

    try {
      navigate(route, { replace: true });
    } finally {
      isNavigatingToHostPathRef.current = false;
    }
  }, [slug, path, navigationRequest]);
}

// A request is cleared when a newer `path` arrives, so the latest of the two wins.
// embed.js does not validate the path of a repeated write, so a request for another app or an unsafe route
// only navigates to `path` again.
function getRequestedPath(
  slug: string,
  path: string,
  navigationRequest: NavigationRequest | null,
): string {
  const isRequestForThisApp =
    navigationRequest !== null &&
    getEmbeddedAppSlugFromPath(navigationRequest.path) === slug;

  return isRequestForThisApp ? navigationRequest.path : path;
}

function getHostPathRoute(slug: string, hostPath: string): string | null {
  const normalizedPath = normalizeDataAppPath(hostPath);

  const targetUrl = getDataAppEmbedUrl(
    getCurrentMetabaseInstanceUrl(),
    normalizedPath,
  );

  if (getCurrentUrl().href === targetUrl.href) {
    return null;
  }

  const route = normalizedPath.slice(slug.length);

  return route.startsWith("/") ? route : `/${route}`;
}

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
