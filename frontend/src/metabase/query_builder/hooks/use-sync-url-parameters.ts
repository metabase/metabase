import querystring from "querystring";

import { useEffect, useMemo } from "react";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Parameter } from "metabase-types/api";

interface UseSyncUrlParametersProps {
  parameters?: Parameter[];
  enabled?: boolean;
}

export function useSyncUrlParameters({
  parameters,
  enabled = true,
}: UseSyncUrlParametersProps) {
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
     */
    if (IS_EMBED_PREVIEW || !enabled) {
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
  }, [enabled, queryParams]);
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
