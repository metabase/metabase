import type { Location } from "history";
import { useEffect, useMemo } from "react";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

import { selectTab } from "../actions";
import { getSlug } from "../components/DashboardTabs/use-sync-url-slug";
import {
  getValuePopulatedParameters,
  getSelectedTab,
  getTabs,
} from "../selectors";

export function useDashboardUrlQuery(location: Location) {
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
      queryParams.tab = getSlug({
        tabId: selectedTab.id,
        name: selectedTab.name,
      });
    }

    return queryParams;
  }, [parameterValuesBySlug, tabs, selectedTab]);

  useSyncedQueryString(queryParams, location);

  useEffect(() => {
    if (!selectedTab || !tabs.length) {
      return;
    }

    // Handles cases when the slug is changed, but redux state is not
    // (example: navigating to a previous tab using browser's back button)
    const slugTabId = parseTabId(location);
    if (slugTabId && selectedTab.id !== slugTabId) {
      const tab = tabs.find(tab => tab.id === slugTabId);
      if (tab) {
        dispatch(selectTab({ tabId: slugTabId }));
      }
    }
  }, [selectedTab, tabs, location, dispatch]);
}

function parseTabId(location: Location) {
  const slug = location.query?.tab;
  if (typeof slug === "string" && slug.length > 0) {
    const id = parseInt(slug, 10);
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}
