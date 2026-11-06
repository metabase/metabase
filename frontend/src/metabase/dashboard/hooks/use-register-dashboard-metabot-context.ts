import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getDashboard, getSelectedTab } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const dashboard = getDashboard(state);
    if (!dashboard) {
      return {};
    }

    // a tab added in edit mode has a temporary negative id until the dashboard is saved
    const tab = getSelectedTab(state);
    const savedTab = tab && tab.id > 0 ? tab : null;
    return {
      user_is_viewing: [
        {
          type: "dashboard",
          id: dashboard.id,
          ...(savedTab && { tab_id: savedTab.id }),
        },
      ],
    };
  }, []);
};
