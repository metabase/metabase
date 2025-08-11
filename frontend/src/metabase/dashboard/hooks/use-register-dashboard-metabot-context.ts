import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getDashboard } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const dashboard = getDashboard(state);
    if (!dashboard) {
      return {};
    }

    return {
      user_is_viewing: [{ type: "dashboard", id: dashboard.id }],
    };
  }, []);
};
