import {
  useRegisterMetabotContextProvider,
  useRegisterMetabotPageContextEntity,
} from "metabase/metabot";
import { useSelector } from "metabase/redux";

import { getDashboard } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  const dashboard = useSelector(getDashboard);
  useRegisterMetabotPageContextEntity(
    dashboard
      ? {
          key: `dashboard:${dashboard.id}`,
          name: dashboard.name,
          icon: "dashboard",
        }
      : null,
  );

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
