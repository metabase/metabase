import React, { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  getAutoApplyFiltersToastStateName,
  getDashboardId,
  getIsAutoApplyFilters,
  getParameterValues,
} from "metabase/dashboard/selectors";
import {
  dismissAutoApplyFiltersToast,
  saveDashboardAndCards,
  setDashboardAttributes,
  setNeverShowAutoApplyFiltersToast,
  setReadyForAutoApplyFiltersToast,
} from "metabase/dashboard/actions";
import { addUndo } from "metabase/redux/undo";
import { ToasterButton } from "metabase/components/Toaster/Toaster.styled";

export default function AutoApplyFilterToast() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const parameterValues = useSelector(getParameterValues);
  const autoApplyFiltersToastStateName = useSelector(
    getAutoApplyFiltersToastStateName,
  );
  const dashboardId = useSelector(getDashboardId);

  const hasParameterValues = useMemo(
    () =>
      Object.values(parameterValues).some(parameterValue =>
        Array.isArray(parameterValue)
          ? parameterValue.length > 0
          : parameterValue != null,
      ),
    [parameterValues],
  );
  const isReadyForToast = isAutoApplyFilters && hasParameterValues;

  const dispatch = useDispatch();

  useEffect(() => {
    if (isReadyForToast) {
      dispatch(setReadyForAutoApplyFiltersToast());
    } else {
      dispatch(setNeverShowAutoApplyFiltersToast());
    }
  }, [dispatch, isReadyForToast]);

  useEffect(() => {
    if (autoApplyFiltersToastStateName === "shown") {
      dispatch(dismissAutoApplyFiltersToast());
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
              <ToasterButton
                className="ml2"
                onClick={onTurnOffAutoApplyFilters}
              >
                {t`Turn off`}
              </ToasterButton>
            </>
          ),
        }),
      );
    }
  }, [autoApplyFiltersToastStateName, dashboardId, dispatch]);

  return null;
}
