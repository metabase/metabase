import type { Location } from "history";
import { useEffect } from "react";
import { replace } from "react-router-redux";
import { usePrevious } from "react-use";
import _ from "underscore";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { useDispatch } from "metabase/lib/redux";

export function useSyncedQueryString(
  object: Record<string, any>,
  location: Location,
) {
  const dispatch = useDispatch();

  const previousObject = usePrevious(object);

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

    if (_.isEqual(previousObject, object)) {
      return;
    }

    const currentQuery = location?.query ?? {};

    const currentUrlParametersObject = _.pick(
      currentQuery,
      ...Object.keys(object),
    );
    const nextUrlParametersObject = toLocationQuery(object);

    if (!_.isEqual(currentUrlParametersObject, nextUrlParametersObject)) {
      const otherUrlParameters = _.pick(
        currentQuery,
        ...QUERY_PARAMS_ALLOW_LIST,
      );
      const nextQuery = { ...otherUrlParameters, ...nextUrlParametersObject };
      dispatch(replace({ ...location, query: nextQuery }));
    }
  }, [object, previousObject, location, dispatch]);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId", "tab"];

function toLocationQuery(object: Record<string, any>) {
  return _.mapObject(object, value => (value == null ? "" : value));
}
