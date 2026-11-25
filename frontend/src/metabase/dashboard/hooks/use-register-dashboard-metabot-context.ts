import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type { MetabotDashboardFilterValue } from "metabase-types/api";

import { getDashboard, getParameterValues, getSelectedTab } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const dashboard = getDashboard(state);
    if (!dashboard) {
      return {};
    }

    // a tab added in edit mode has a temporary negative id until the dashboard is saved
    const tab = getSelectedTab(state);
    const savedTab = tab && tab.id > 0 ? tab : null;
    // the values the cards ran with, not the drafts of a dashboard that doesn't apply filters automatically
    const parameters: MetabotDashboardFilterValue[] = Object.entries(
      getParameterValues(state),
    ).map(([id, value]) => ({ id, value: value ?? null }));
    return {
      user_is_viewing: [
        {
          type: "dashboard",
          id: dashboard.id,
          ...(savedTab && { tab_id: savedTab.id }),
          parameters,
        },
      ],
    };
  }, []);
};
