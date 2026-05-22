import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useSelector } from "metabase/redux";

import { getDashboard } from "../selectors";

export const useRegisterDashboardMetabotContext = () => {
  const currentDashboard = useSelector(getDashboard);
  const currentDashboardId = currentDashboard?.id;
  const currentDashboardName = currentDashboard?.name;

  useRegisterMetabotContextProvider(async () => {
    if (!currentDashboardId) {
      return {};
    }

    return {
      user_is_viewing: [
        {
          type: "dashboard",
          id: currentDashboardId,
          name: currentDashboardName,
        },
      ],
    };
  }, [currentDashboardId, currentDashboardName]);
};
