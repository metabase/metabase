import type { Location } from "history";
import qs from "querystring";
import { useEffect, useMemo } from "react";
import type { InjectedRouter } from "react-router";
import { push, replace } from "react-router-redux";
import { usePrevious } from "react-use";
import _ from "underscore";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

import { selectTab } from "../actions";
import {
  getValuePopulatedParameters,
  getSelectedTab,
  getTabs,
} from "../selectors";
import { createTabSlug } from "../utils";

export function useDashboardUrlQuery(
  router: InjectedRouter,
  location: Location,
) {
  const parameters = useSelector(getValuePopulatedParameters);

  const tabs = useSelector(getTabs);
  const selectedTab = useSelector(getSelectedTab);

  const dispatch = useDispatch();

  const parameterValuesBySlug = useMemo(
    () => getParameterValuesBySlug(parameters),
    [parameters],
  );

  const queryParams = useMemo(() => {
    const queryParams = { ...parameterValuesBySlug };

    const hasRealSelectedTab = selectedTab && selectedTab.id > 0;
    if (hasRealSelectedTab && tabs.length > 1) {
      queryParams.tab = createTabSlug(selectedTab);
    }

    return queryParams;
  }, [parameterValuesBySlug, tabs, selectedTab]);

  const previousQueryParams = usePrevious(queryParams);

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

    const currentQuery = location?.query ?? {};

    const nextQueryParams = toLocationQuery(queryParams);
    const currentQueryParams = _.omit(currentQuery, ...QUERY_PARAMS_ALLOW_LIST);

    if (!_.isEqual(nextQueryParams, currentQueryParams)) {
      const otherQueryParams = _.pick(currentQuery, ...QUERY_PARAMS_ALLOW_LIST);
      const nextQuery = { ...otherQueryParams, ...nextQueryParams };
      const nextSearch =
        Object.keys(nextQuery).length > 0 ? `?${qs.stringify(nextQuery)}` : "";
      const nextLocation = location.pathname + nextSearch + location.hash;

      const isDashboardTabChange =
        queryParams &&
        previousQueryParams?.tab &&
        queryParams.tab !== previousQueryParams.tab;

      const action = isDashboardTabChange ? push : replace;
      dispatch(action(nextLocation));
    }
  }, [queryParams, previousQueryParams, location, dispatch]);

  useEffect(() => {
    // @ts-expect-error missing type declaration
    const unsubscribe = router.listen(nextLocation => {
      const isSamePath = nextLocation.pathname === location.pathname;
      if (!isSamePath) {
        return;
      }

      const currentTabId = parseTabId(location);
      const nextTabId = parseTabId(nextLocation);

      if (nextTabId && currentTabId !== nextTabId) {
        dispatch(selectTab({ tabId: nextTabId }));
      }
    });

    return () => unsubscribe();
  }, [router, location, selectedTab, dispatch]);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId"];

function parseTabId(location: Location) {
  const slug = location.query?.tab;
  if (typeof slug === "string" && slug.length > 0) {
    const id = parseInt(slug, 10);
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}

function toLocationQuery(object: Record<string, any>) {
  return _.mapObject(object, value => (value == null ? "" : value));
}
