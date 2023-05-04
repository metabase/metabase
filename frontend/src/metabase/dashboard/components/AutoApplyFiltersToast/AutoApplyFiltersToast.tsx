import { useEffect } from "react";
import { t } from "ttag";
import { useUnmount } from "react-use";

import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  getDashboardId,
  getIsReadyToShowAutoApplyFiltersToast,
} from "metabase/dashboard/selectors";
import {
  saveDashboardAndCards,
  setDashboardAttributes,
} from "metabase/dashboard/actions";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useUniqueId } from "metabase/hooks/use-unique-id";

export default function AutoApplyFilterToast() {
  const dashboardId = useSelector(getDashboardId);
  const isReadyToShowAutoApplyFiltersToast = useSelector(
    getIsReadyToShowAutoApplyFiltersToast,
  );

  const dispatch = useDispatch();

  const autoApplyFiltersToastId = useUniqueId();
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
          id: autoApplyFiltersToastId,
          timeout: false,
          message: t`You can make this dashboard snappier by turning off auto-applying filters.`,
          action: onTurnOffAutoApplyFilters,
          actionLabel: t`Turn off`,
        }),
      );
    } else {
      dispatch(dismissUndo(autoApplyFiltersToastId, false));
    }
  }, [
    autoApplyFiltersToastId,
    dashboardId,
    dispatch,
    isReadyToShowAutoApplyFiltersToast,
  ]);

  useUnmount(() => {
    dispatch(dismissUndo(autoApplyFiltersToastId, false));
  });

  return null;
}
