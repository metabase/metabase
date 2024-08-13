import { useCallback } from "react";

import { setDashboardAttributes } from "metabase/dashboard/actions";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Dashboard as IDashboard } from "metabase-types/api";

export const useSetDashboardAttributeHandler = () => {
  const dispatch = useDispatch();

  const dashboard = useSelector(getDashboardComplete);

  return useCallback(
    <Key extends keyof IDashboard>(attribute: Key, value: IDashboard[Key]) => {
      if (dashboard) {
        dispatch(
          setDashboardAttributes({
            id: dashboard.id,
            attributes: { [attribute]: value },
          }),
        );
      }
    },
    [dashboard, dispatch],
  );
};
