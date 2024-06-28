import type { Location } from "history";
import { useMemo } from "react";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import { useSelector } from "metabase/lib/redux";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

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
}
