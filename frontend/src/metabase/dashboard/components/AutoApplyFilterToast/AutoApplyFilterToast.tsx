import React, { useEffect, useRef } from "react";
import _ from "underscore";
import { t } from "ttag";

import { useSelector, useDispatch } from "metabase/lib/redux";
import { useToaster } from "metabase/components/Toaster";
import {
  getDashboardId,
  getIsAutoApplyFilters,
  getIsLoadingComplete,
  getParameterValues,
} from "metabase/dashboard/selectors";
import {
  saveDashboardAndCards,
  setDashboardAttributes,
} from "metabase/dashboard/actions";

interface AutoApplyFilterToastProps {
  isShowingSlowToaster: boolean;
}

export default function AutoApplyFilterToast({
  isShowingSlowToaster,
}: AutoApplyFilterToastProps) {
  const [autoApplyFiltersToasterApi, autoApplyFiltersToaster] = useToaster();
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const parameterValues = useSelector(getParameterValues);
  const isAllDashcardsLoaded = useSelector(getIsLoadingComplete);
  const dashboardId = useSelector(getDashboardId);

  const dispatch = useDispatch();

  const haveEverShownSlowToasterWhenAutoApplyFilters = useRef(false);
  if (isShowingSlowToaster && isAutoApplyFilters) {
    haveEverShownSlowToasterWhenAutoApplyFilters.current = true;
  }

  useEffect(() => {
    const isShowingAutoApplyFiltersToast =
      isAutoApplyFilters &&
      !_.isEmpty(parameterValues) &&
      isAllDashcardsLoaded &&
      haveEverShownSlowToasterWhenAutoApplyFilters.current &&
      !isShowingSlowToaster;

    if (isShowingAutoApplyFiltersToast) {
      autoApplyFiltersToasterApi.show({
        size: "medium",
        message: t`You can make this dashboard snappier by turning off auto-applying filters.`,
        confirmText: t`Turn off`,
        onConfirm: () => {
          dispatch(
            setDashboardAttributes({
              id: dashboardId,
              attributes: {
                auto_apply_filters: false,
              },
            }),
          );
          dispatch(saveDashboardAndCards(dashboardId));
          autoApplyFiltersToasterApi.hide();
          // XXX: Make the dashboard not reload after clicking the button
        },
      });
    }
  }, [
    autoApplyFiltersToasterApi,
    dashboardId,
    dispatch,
    isAllDashcardsLoaded,
    isAutoApplyFilters,
    isShowingSlowToaster,
    parameterValues,
  ]);

  // Display toasts only when
  // 1. dashboard.auto_apply_filters = false
  // 2. dashboard has filters applied
  // 3. when all dashboard cards are loaded but after the 15s timeout, which is when we determine that the dashboard is slow
  return (
    <>
      {/* XXX: Make toaster stackable */}
      {/* XXX: Make toaster longer */}
      {autoApplyFiltersToaster}
    </>
  );
}
