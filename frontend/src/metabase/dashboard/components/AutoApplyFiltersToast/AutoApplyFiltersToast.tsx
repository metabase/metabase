import React, { useEffect } from "react";
import { t } from "ttag";
import { useUnmount } from "react-use";

import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  getDashboardId,
  getIsShowingAutoApplyFiltersToast,
} from "metabase/dashboard/selectors";
import {
  saveDashboardAndCards,
  setDashboardAttributes,
  setIsShowingAutoApplyFiltersToast,
} from "metabase/dashboard/actions";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { StyledToasterButton } from "./AutoApplyFiltersToast.styled";

export default function AutoApplyFilterToast() {
  const dashboardId = useSelector(getDashboardId);
  const isShowingAutoApplyFiltersToast = useSelector(
    getIsShowingAutoApplyFiltersToast,
  );

  const dispatch = useDispatch();

  const autoApplyFiltersToastId = useUniqueId();
  useEffect(() => {
    if (isShowingAutoApplyFiltersToast) {
      dispatch(setIsShowingAutoApplyFiltersToast(false));
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
        dispatch(setIsShowingAutoApplyFiltersToast(false));
        dispatch(dismissUndo(autoApplyFiltersToastId, false));
      };

      dispatch(
        addUndo({
          id: autoApplyFiltersToastId,
          timeout: false,
          message: (
            <>
              {t`You can make this dashboard snappier by turning off auto-applying filters.`}
              <StyledToasterButton onClick={onTurnOffAutoApplyFilters}>
                {t`Turn off`}
              </StyledToasterButton>
            </>
          ),
        }),
      );
    }
  }, [
    autoApplyFiltersToastId,
    dashboardId,
    dispatch,
    isShowingAutoApplyFiltersToast,
  ]);

  useUnmount(() => {
    dispatch(setIsShowingAutoApplyFiltersToast(false));
    dispatch(dismissUndo(autoApplyFiltersToastId, false));
  });

  return null;
}
