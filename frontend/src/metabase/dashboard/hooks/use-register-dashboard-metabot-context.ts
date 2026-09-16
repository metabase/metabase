import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { isAdhocDashboardId } from "metabase/utils/dashboard";

import { getDashboard } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const dashboard = getDashboard(state);
    if (!dashboard || isAdhocDashboardId(dashboard.id)) {
      return {};
    }

    return {
      user_is_viewing: [{ type: "dashboard", id: dashboard.id }],
    };
  }, []);
};
