import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getDashboard } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(state => {
    const dashboard = getDashboard(state);
    if (!dashboard) {
      return {};
    }

    return {
      dashboard_id: dashboard.id,
    };
  }, []);
};
