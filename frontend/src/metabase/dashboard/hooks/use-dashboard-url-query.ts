import type { Location } from "history";
import { useMemo } from "react";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import { useSelector } from "metabase/lib/redux";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

import { getSlug } from "../components/DashboardTabs/use-sync-url-slug";
import { getValuePopulatedParameters, getSelectedTab } from "../selectors";

export function useDashboardUrlQuery(location: Location) {
  const parameters = useSelector(getValuePopulatedParameters);
  const selectedTab = useSelector(getSelectedTab);

  const queryParameters = useMemo(() => {
    const queryParameters = getParameterValuesBySlug(parameters);
    if (selectedTab) {
      queryParameters.tab = getSlug({
        tabId: selectedTab.id,
        name: selectedTab.name,
      });
    }
    return queryParameters;
  }, [parameters, selectedTab]);

  useSyncedQueryString(queryParameters, location);
}
