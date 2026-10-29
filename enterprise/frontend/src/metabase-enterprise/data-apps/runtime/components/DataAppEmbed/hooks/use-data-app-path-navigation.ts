import { useEffect } from "react";

import { navigate } from "embedding-sdk-package/lib/private/data-app-routing";
import {
  getDataAppEmbedUrl,
  normalizeDataAppPath,
} from "embedding-sdk-shared/lib/embedded-data-app-path";
import { getCurrentMetabaseInstanceUrl } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";

/**
 * Updates the current path of the data app router
 * when the `path` prop changes.
 **/
export function useDataAppPathNavigation({
  name,
  path,
}: {
  name: string;
  path: string;
}) {
  useEffect(() => {
    const currentUrl = new URL(window.location.href);

    // Added by embed.js for loading iframes in parallel.
    // We don't need it for path comparison.
    currentUrl.searchParams.delete(
      EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME,
    );

    const normalizedPath = normalizeDataAppPath(path);

    const targetUrl = getDataAppEmbedUrl(
      getCurrentMetabaseInstanceUrl(),
      normalizedPath,
    );

    if (currentUrl.href !== targetUrl.href) {
      const route = normalizedPath.slice(name.length);

      navigate(route.startsWith("/") ? route : `/${route}`);
    }
  }, [name, path]);
}
