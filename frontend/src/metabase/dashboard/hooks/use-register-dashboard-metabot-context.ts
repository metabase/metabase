import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type { MetabotDashboardFilterValue } from "metabase-types/api";

import { getDashboard, getParameterValues } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  useRegisterMetabotContextProvider(async (state) => {
    const dashboard = getDashboard(state);
    if (!dashboard) {
      return {};
    }

    // the values the cards ran with, not the drafts of a dashboard that doesn't apply filters automatically
    const parameters: MetabotDashboardFilterValue[] = Object.entries(
      getParameterValues(state),
    ).map(([id, value]) => ({ id, value: value ?? null }));
    return {
      user_is_viewing: [{ type: "dashboard", id: dashboard.id, parameters }],
    };
  }, []);
};
