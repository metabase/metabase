import querystring from "querystring";
import { useEffect } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { useDispatch } from "metabase/lib/redux";

export function useSyncedQueryString(
  fn: () => Record<string, any>,
  deps: any[],
) {
  const dispatch = useDispatch();

  useEffect(() => {
    /**
     * We don't want to sync the query string to the URL because when previewing,
     * this changes the URL of the iframe by appending the query string to the src.
     * This causes the iframe to reload when changing the preview hash from appearance
     * settings because now the base URL (including the query string) is different.
     */
    if (IS_EMBED_PREVIEW) {
      return;
    }
    const object = fn();
    const searchString = buildSearchString(object);

    if (searchString !== window.location.search) {
      dispatch(
        push({
          pathname: window.location.pathname,
          search: searchString,
          hash: window.location.hash,
        }),
      );
    }

    // exhaustive-deps is enabled for useSyncedQueryString so we don't need to include `fn` as a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId", "tab"];

function buildSearchString(object: Record<string, any>) {
  const currentSearchParams = querystring.parse(
    window.location.search.replace("?", ""),
  );
  const filteredSearchParams = Object.fromEntries(
    Object.entries(currentSearchParams).filter(entry =>
      QUERY_PARAMS_ALLOW_LIST.includes(entry[0]),
    ),
  );

  const search = querystring.stringify({
    ...filteredSearchParams,
    ...object,
  });
  return search ? `?${search}` : "";
}
