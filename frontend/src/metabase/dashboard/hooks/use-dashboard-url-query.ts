import { useEffect, useMemo, useRef } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";

import { isEmbedPreview } from "metabase/embedding/config";
import { useDispatch, useSelector } from "metabase/redux";
import { selectTab } from "metabase/redux/dashboard";
import {
  type Location,
  queryToSearch,
  subscribeLocation,
  useIsNavigating,
  useIsNavigationHeld,
  useNavigate,
} from "metabase/router";
import { useSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import { getPathnameWithoutSubPath } from "metabase/utils/dom";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

import {
  getDashboard,
  getSelectedTab,
  getTabs,
  getValuePopulatedParameters,
} from "../selectors";
import { createTabSlug, parseTabSlug } from "../utils";

export function useDashboardUrlQuery(location: Location) {
  const dashboardId = useSelector((state) => getDashboard(state)?.id);
  const tabs = useSelector(getTabs);
  const selectedTab = useSelector(getSelectedTab);
  const parameters = useSelector(getValuePopulatedParameters);
  const siteUrl = useSetting("site-url");
  const isNavigationHeld = useIsNavigationHeld();
  const isNavigating = useIsNavigating();

  const dispatch = useDispatch();
  const navigate = useNavigate();

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
  const hasDeferredSyncRef = useRef(false);

  useEffect(() => {
    /**
     * We don't want to sync the query string to the URL because when previewing,
     * this changes the URL of the iframe by appending the query string to the src.
     * This causes the iframe to reload when changing the preview hash from appearance
     * settings because now the base URL (including the query string) is different.
     */
    if (isEmbedPreview() || !dashboardId) {
      return;
    }

    /**
     * A leave prompt is up, and the router holds a single pending navigation.
     * Syncing now would replace the destination the user is being asked about,
     * and letting them through would then take them somewhere else. Note that
     * the sync was skipped, because `previousQueryParams` still advances and
     * would otherwise swallow it once the prompt is answered.
     */
    if (isNavigationHeld) {
      hasDeferredSyncRef.current = true;
      return;
    }

    /**
     * The router is on its way somewhere else and has not committed it yet,
     * which a `route.lazy` destination makes possible. Syncing now would replace
     * that pending navigation and strand the user on the dashboard. Note the
     * skip the same way, so the sync still happens if we stay put.
     */
    if (isNavigating) {
      hasDeferredSyncRef.current = true;
      return;
    }

    const pathname = getPathnameWithoutSubPath(location.pathname, siteUrl);
    const isDashboardUrl = pathname.startsWith("/dashboard/");
    if (isDashboardUrl) {
      const dashboardSlug = pathname.replace("/dashboard/", "");
      const dashboardUrlId = Urls.extractEntityId(dashboardSlug);
      const isNavigationInProgress = dashboardId !== dashboardUrlId;
      if (isNavigationInProgress) {
        return;
      }
    }

    if (
      !hasDeferredSyncRef.current &&
      _.isEqual(previousQueryParams, queryParams)
    ) {
      return;
    }
    hasDeferredSyncRef.current = false;

    const currentQuery = parseSearchQuery(location.search);

    const nextQueryParams = toLocationQuery(queryParams);
    const currentQueryParams = _.omit(currentQuery, ...QUERY_PARAMS_ALLOW_LIST);

    if (!_.isEqual(nextQueryParams, currentQueryParams)) {
      const otherQueryParams = _.pick(currentQuery, ...QUERY_PARAMS_ALLOW_LIST);
      const nextQuery = { ...otherQueryParams, ...nextQueryParams };

      const isDashboardTabChange =
        queryParams &&
        previousQueryParams?.tab &&
        queryParams.tab !== previousQueryParams.tab;

      navigate(
        { ...location, search: queryToSearch(nextQuery) },
        { replace: !isDashboardTabChange, state: location.state },
      );
    }
  }, [
    dashboardId,
    queryParams,
    previousQueryParams,
    location,
    siteUrl,
    navigate,
    isNavigationHeld,
    isNavigating,
  ]);

  useEffect(() => {
    return subscribeLocation((nextLocation) => {
      const isSamePath = nextLocation.pathname === location.pathname;
      if (!isSamePath) {
        return;
      }

      const currentTabId = parseTabSlug(location);
      const nextTabId = parseTabSlug(nextLocation);

      if (nextTabId && currentTabId !== nextTabId) {
        dispatch(selectTab({ tabId: nextTabId }));
      }
    });
  }, [location, selectedTab, dispatch]);
}

const QUERY_PARAMS_ALLOW_LIST = ["objectId", "returnToEmbeddingSetupGuide"];

function toLocationQuery(object: Record<string, any>) {
  return _.mapObject(object, (value) => (value == null ? "" : value));
}
