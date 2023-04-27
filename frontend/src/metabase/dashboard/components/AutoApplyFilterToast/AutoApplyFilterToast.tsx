import React, { useEffect, useState } from "react";
import _ from "underscore";
import { t } from "ttag";

import { useSelector, useDispatch } from "metabase/lib/redux";
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
import { useMachine } from "metabase/hooks/use-machine";

export default function AutoApplyFilterToast() {
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const parameterValues = useSelector(getParameterValues);
  const isAllDashcardsLoaded = useSelector(getIsLoadingComplete);
  const dashboardId = useSelector(getDashboardId);
  const latestLoadingStartTime = useLatestLoadingStartTime();

  const isReadyForToast = isAutoApplyFilters && !_.isEmpty(parameterValues);

  const [state, send] = useMachine({
    ...MACHINE_CONFIG,
    initialState: isReadyForToast ? "ready" : "never",
  });

  const dispatch = useDispatch();

  useEffect(() => {
    if (isReadyForToast) {
      send("READY");
    } else {
      send("NEVER");
    }
  }, [isReadyForToast, send]);

  useEffect(() => {
    if (latestLoadingStartTime > 0) {
      send("LOAD_CARDS");
      const timeoutId = setTimeout(() => {
        send("TIME_OUT");
      }, DASHBOARD_SLOW_TIMEOUT);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [latestLoadingStartTime, send]);

  useEffect(() => {
    if (isAllDashcardsLoaded) {
      send("CARDS_LOADED");
    }
  }, [isAllDashcardsLoaded, send]);

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
    send("NEVER");
  };

  return (
    <Toaster
      isShown={state === "shown"}
      fixed
      onDismiss={() => {
        send("DISMISS_TOAST");
      }}
      message={t`You can make this dashboard snappier by turning off auto-applying filters.`}
      confirmText={t`Turn off`}
      onConfirm={onTurnOffAutoApplyFilters}
    />
  );
}

function useLatestLoadingStartTime() {
  const loadingStartTime = useSelector(getLoadingStartTime);

  const [latestLoadingStartTime, setLatestLoadingStartTime] =
    useState(loadingStartTime);

  useEffect(() => {
    if (loadingStartTime > 0) {
      setLatestLoadingStartTime(loadingStartTime);
    }
  }, [loadingStartTime]);

  return latestLoadingStartTime;
}

const MACHINE_CONFIG = {
  states: {
    never: {
      on: { READY: "ready" },
    },
    ready: {
      on: {
        NEVER: "never",
        LOAD_CARDS: "loading",
      },
    },
    loading: {
      on: {
        NEVER: "never",
        TIME_OUT: "timedOut",
        LOAD_CARDS: "loading",
        CARDS_LOADED: "ready",
      },
    },
    timedOut: {
      on: {
        NEVER: "never",
        LOAD_CARDS: "loading",
        CARDS_LOADED: "shown",
      },
    },
    shown: {
      on: {
        NEVER: "never",
        DISMISS_TOAST: "ready",
      },
    },
  },
} as const;
