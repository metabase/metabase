import React, { useEffect } from "react";
import { t } from "ttag";

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
import { addUndo } from "metabase/redux/undo";
import { StyledToasterButton } from "./AutoApplyFiltersToast.styled";

export default function AutoApplyFilterToast() {
  const dashboardId = useSelector(getDashboardId);
  const isShowingAutoApplyFiltersToast = useSelector(
    getIsShowingAutoApplyFiltersToast,
  );

  const dispatch = useDispatch();

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
      };

      dispatch(
        addUndo({
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
  }, [dashboardId, dispatch, isShowingAutoApplyFiltersToast]);

  return null;
}
