import React, { useEffect, useRef, useState } from "react";
import _ from "underscore";
import { t } from "ttag";

import { useSelector, useDispatch } from "metabase/lib/redux";
import { useToaster } from "metabase/components/Toaster";
import {
  getDashboardId,
  getIsAutoApplyFilters,
  getIsLoadingComplete,
  getParameterValues,
  getLoadingStartTime,
} from "metabase/dashboard/selectors";
import {
  saveDashboardAndCards,
  setDashboardAttributes,
} from "metabase/dashboard/actions";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import Toaster from "metabase/components/Toaster/Toaster";

export default function AutoApplyFilterToast() {
  const [autoApplyFiltersToasterApi] = useToaster();
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const parameterValues = useSelector(getParameterValues);
  const isAllDashcardsLoaded = useSelector(getIsLoadingComplete);
  const dashboardId = useSelector(getDashboardId);
  const hasShownSlowToaster = useHasShownSlowToaster();

  const dispatch = useDispatch();

  const haveEverShownSlowToasterWhenAutoApplyFilters = useRef(false);
  if (hasShownSlowToaster && isAutoApplyFilters) {
    haveEverShownSlowToasterWhenAutoApplyFilters.current = true;
  }

  const isShowingAutoApplyFiltersToast =
    isAutoApplyFilters &&
    !_.isEmpty(parameterValues) &&
    isAllDashcardsLoaded &&
    hasShownSlowToaster &&
    haveEverShownSlowToasterWhenAutoApplyFilters.current;

  const {
    isShown: isToastShown,
    hide: hideToast,
    show: showToast,
  } = autoApplyFiltersToasterApi;

  useEffect(() => {
    if (isShowingAutoApplyFiltersToast) {
      showToast();
    }
  }, [isShowingAutoApplyFiltersToast, showToast]);

  const onTurnOffAutoApplyFilters = () => {
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
  };

  return (
    <Toaster
      isShown={isToastShown}
      fixed
      onDismiss={hideToast}
      message={t`You can make this dashboard snappier by turning off auto-applying filters.`}
      confirmText={t`Turn off`}
      onConfirm={onTurnOffAutoApplyFilters}
    />
  );
}

function useHasShownSlowToaster() {
  const [hasShownSlowToaster, setHasShownSlowToaster] = useState(false);
  const loadingStartTime = useSelector(getLoadingStartTime);
  const [latestLoadingStartTime, setLatestLoadingStartTime] =
    useState(loadingStartTime);
  const isAllDashcardsLoaded = useSelector(getIsLoadingComplete);
  const isAllDashcardsLoadedRef = useRef(isAllDashcardsLoaded);
  isAllDashcardsLoadedRef.current = isAllDashcardsLoaded;

  useEffect(() => {
    if (loadingStartTime > 0) {
      setLatestLoadingStartTime(loadingStartTime);
      // // This ensure that the flag resets every time we refresh the dashboard via changing parameter values
    }
  }, [loadingStartTime]);

  useEffect(() => {
    if (latestLoadingStartTime) {
      const timer = setTimeout(() => {
        if (!isAllDashcardsLoadedRef.current) {
          setHasShownSlowToaster(true);
        }
      }, DASHBOARD_SLOW_TIMEOUT);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [latestLoadingStartTime]);

  return hasShownSlowToaster;
}
