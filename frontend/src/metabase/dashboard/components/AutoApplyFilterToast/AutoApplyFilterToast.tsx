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
  dismissToast,
  saveDashboardAndCards,
  setDashboardAttributes,
  setNever,
  setReady,
} from "metabase/dashboard/actions";
import Toaster from "metabase/components/Toaster/Toaster";

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
      dispatch(setReady());
    } else {
      dispatch(setNever());
    }
  }, [dispatch, isReadyForToast]);

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
    dispatch(dismissToast());
  };

  return (
    <Toaster
      isShown={autoApplyFiltersToastStateName === "shown"}
      fixed
      onDismiss={() => {
        dispatch(dismissToast());
      }}
      message={t`You can make this dashboard snappier by turning off auto-applying filters.`}
      confirmText={t`Turn off`}
      onConfirm={onTurnOffAutoApplyFilters}
    />
  );
}
