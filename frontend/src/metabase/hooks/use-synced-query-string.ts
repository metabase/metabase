import querystring from "querystring";
import { useEffect } from "react";
import { useLocation, usePrevious } from "react-use";
import _ from "underscore";

import { setParameterValuesFromQueryParams } from "metabase/dashboard/actions";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { useDispatch } from "metabase/lib/redux";

export function useSyncedQueryString(
  fn: () => Record<string, any>,
  deps: any[],
) {
  const dispatch = useDispatch();
  const location = useLocation();
  const previousLocation = usePrevious(location);
  const previousDeps = usePrevious(deps);

  useEffect(() => {
    // if the dependencies have not changed, but the location has,
    // update the parameters to reflect the new URL state
    if (
      _.isEqual(previousDeps, deps) &&
      previousLocation &&
      previousLocation.search !== location.search
    ) {
      const search = location?.search?.substring(1) || "";
      const query = querystring.parse(search);
      dispatch(setParameterValuesFromQueryParams(query));
      return;
    }

    /**
     * We don't want to sync the query string to the URL because when previewing,
     * this changes the URL of the iframe by appending the query string to the src.
     * This causes the iframe to reload when changing the preview hash from appearance
     * settings because now the base URL (including the query string) is different.
     */
    if (IS_EMBED_PREVIEW) {
      return;
    }

    // if the dependencies have changed and the location does not match
    // the dependency state,
    // update the URL state to reflect the new parameter state
    const object = fn();
    const searchString = buildSearchString(object);
    if (!_.isEqual(previousDeps, deps) && searchString !== location.search) {
      history.replaceState(
        null,
        document.title,
        location.pathname + searchString + location.hash,
      );
    }
    // exhaustive-deps is enabled for useSyncedQueryString so we don't need to include `fn` as a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, location]);
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
