import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getDashboard, getSelectedTab } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const dashboard = getDashboard(state);
    if (!dashboard) {
      return {};
    }

    const tab = getSelectedTab(state);
    return {
      user_is_viewing: [
        { type: "dashboard", id: dashboard.id, ...(tab && { tab_id: tab.id }) },
      ],
    };
  }, []);
};
