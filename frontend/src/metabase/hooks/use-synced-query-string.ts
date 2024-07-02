import { useEffect } from "react";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { buildSearchString } from "metabase/lib/urls";
import type { Location } from "history";
import { useDispatch } from "react-redux";
import { isEqual } from "underscore";
import _ from "underscore";
import {
  isNotNull,
  isNullOrUndefined,
  removeNullAndUndefinedValues,
} from "metabase/lib/types";
import { replace } from "react-router-redux";

export function useSyncedQueryString(
  object: Record<string, any>,
  location: Location,
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

    const pickValidValues = obj =>
      _.mapObject(
        _.pick(obj, val => !(isNullOrUndefined(val) || val === "")),
        value => (_.isArray(value) && value.length === 1 ? value[0] : value),
      );

    const locationQueryParams = _.pick(
      pickValidValues(location.query),
      Object.keys(object),
    );
    const objectParams = _.pick(pickValidValues(object), Object.keys(object));

    if (!isEqual(locationQueryParams, objectParams)) {
      dispatch(
        replace({
          ...location,
          query: pickValidValues({
            ..._.omit(location.query, Object.keys(object)),
            ...objectParams,
          }),
        }),
      );
    }
  }, [dispatch, location, object]);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId", "tab"];

const containsAllowedParams = (objectKey: string) => {
  return QUERY_PARAMS_ALLOW_LIST.includes(objectKey);
};
