import { useEffect } from "react";
import { t } from "ttag";

import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  getDashboardId,
  getIsReadyToShowAutoApplyFiltersToast,
} from "metabase/dashboard/selectors";
import {
  saveDashboardAndCards,
  setDashboardAttributes,
} from "metabase/dashboard/actions";
import { addUndo } from "metabase/redux/undo";

export default function AutoApplyFilterToast() {
  const dashboardId = useSelector(getDashboardId);
  const isReadyToShowAutoApplyFiltersToast = useSelector(
    getIsReadyToShowAutoApplyFiltersToast,
  );

  const dispatch = useDispatch();

  useEffect(() => {
    if (isReadyToShowAutoApplyFiltersToast) {
      const onTurnOffAutoApplyFilters = () => {
        dispatch(
          setDashboardAttributes({
            id: dashboardId,
            attributes: {
              auto_apply_filters: false,
            },
          }),
        );
        dispatch(saveDashboardAndCards());
      };

      dispatch(
        addUndo({
          message: t`You can make this dashboard snappier by turning off auto-applying filters.`,
          action: onTurnOffAutoApplyFilters,
        }),
      );
    }
  }, [dashboardId, dispatch, isReadyToShowAutoApplyFiltersToast]);

  return null;
}
