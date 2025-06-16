import querystring from "querystring";
import { useEffect, useMemo } from "react";

import { isEmbeddingSdk } from "metabase/env";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Parameter } from "metabase-types/api";

export function useSyncUrlParameters(parameters?: Parameter[]) {
  const queryParams = useMemo(
    () => getParameterValuesBySlug(parameters),
    [parameters],
  );

  useEffect(() => {
    /**
     * We don't want to sync the query string to the URL because when previewing,
     * this changes the URL of the iframe by appending the query string to the src.
     * This causes the iframe to reload when changing the preview hash from appearance
     * settings because now the base URL (including the query string) is different.
     *
     * Also, when using the SDK, we don't want to change parent's URL either.
     */
    if (IS_EMBED_PREVIEW || isEmbeddingSdk) {
      return;
    }

    const searchString = buildSearchString(queryParams);
    if (searchString !== window.location.search) {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + searchString + window.location.hash,
      );
    }
  }, [queryParams]);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId"];

function buildSearchString(object: Record<string, any>) {
  const currentSearchParams = querystring.parse(
    window.location.search.replace("?", ""),
  );
  const filteredSearchParams = Object.fromEntries(
    Object.entries(currentSearchParams).filter((entry) =>
      QUERY_PARAMS_ALLOW_LIST.includes(entry[0]),
    ),
  );

  const search = querystring.stringify({
    ...filteredSearchParams,
    ...object,
  });
  return search ? `?${search}` : "";
}
