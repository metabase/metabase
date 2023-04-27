import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useToggle } from "metabase/hooks/use-toggle";

export default function AutoApplyFilterToast() {
  useMachine(MACHINE_CONFIG);
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

  const [isToastShown, { turnOff: hideToast, turnOn: showToast }] = useToggle();

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
    hideToast();
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

const MACHINE_CONFIG = {
  initialState: "never",
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
        DISMISS: "ready",
      },
    },
  },
} as const;

type StateConfig<States> = {
  on?: {
    [A in Action<States>]?: keyof States;
  };
};
type StatesConfig<States> = Record<keyof States, StateConfig<States>>;
type MachineConfig<States> = {
  initialState: keyof States;
  states: StatesConfig<States>;
};

type ValueOf<T> = T[keyof T];
type ActionMap<States> = {
  [State in keyof States]: keyof States[State][keyof States[State]];
};
type Action<States> = ValueOf<ActionMap<States>>;
type Send<States> = (action: Action<States>) => void;
type UseMachineReturn<States> = [keyof States, Send<States>];

function useMachine<Config extends MachineConfig<Config["states"]>>({
  initialState,
  states,
}: Config): UseMachineReturn<Config["states"]> {
  const statesRef = useRef(states);
  const [state, setState] = useState(initialState);
  const send = useCallback((action: Action<Config["states"]>) => {
    setState(state => {
      const nextState = statesRef.current[state].on?.[action];
      return nextState ?? state;
    });
  }, []);
  return [state, send];
}
