import { useEffect, useRef } from "react";
import { isEqual } from "underscore";

import {
  buildControlledParameters,
  buildParametersPayload,
} from "embedding-sdk-bundle/lib/controlled-parameters";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import { startSdkListening } from "embedding-sdk-bundle/store/listener-middleware";
import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { DashboardParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import {
  REMOVE_PARAMETER,
  RESET_PARAMETERS,
  SET_PARAMETER_VALUE,
  fetchDashboard,
  type setParameterValue,
} from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getParameterValues,
  getParameters,
} from "metabase/dashboard/selectors";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import {
  SET_PARAMETER_VALUES,
  setParameterValues,
} from "metabase/redux/dashboard";

type Options = {
  parameters: ParameterValues | undefined;
  onParametersChange:
    | ((payload: DashboardParameterChangePayload) => void)
    | undefined;
};

const PARAMETER_CHANGE_ACTION_TYPES = new Set<string>([
  SET_PARAMETER_VALUES,
  RESET_PARAMETERS,
  REMOVE_PARAMETER,
]);

type SetParameterValueAction = Awaited<
  ReturnType<ReturnType<typeof setParameterValue>>
>;

const isParameterSetAction = (action: {
  type: string;
  payload?: unknown;
}): boolean =>
  action.type === SET_PARAMETER_VALUE &&
  // We must not fire `change` handler on draft parameter updates
  (action.payload as SetParameterValueAction["payload"] | undefined)
    ?.isDraft === false;

export const useSdkControlledParameters = ({
  parameters,
  onParametersChange,
}: Options) => {
  usePushControlledParameters(parameters);
  useObserveAppliedParameters(onParametersChange);
};

const usePushControlledParameters = (
  parameters: ParameterValues | undefined,
) => {
  const dispatch = useSdkDispatch();
  const parameterDefinitions = useSdkSelector(getParameters);
  const appliedParameterValues = useSdkSelector(getParameterValues);
  // To skip redundant dispatches when `parameters` reference didn't change
  // but the effect re-fired (e.g. `parameterDefinitions` got a new reference from a refetch with the same content)
  const lastDispatchedRef = useRef<ParameterValues | undefined>(undefined);

  useEffect(() => {
    if (parameters === undefined) {
      lastDispatchedRef.current = undefined;

      return;
    }

    if (lastDispatchedRef.current === parameters) {
      return;
    }

    if (parameterDefinitions.length === 0) {
      return;
    }

    const next = buildControlledParameters(parameters, parameterDefinitions);

    if (!isEqual(next, appliedParameterValues)) {
      dispatch(setParameterValues(next));
    }

    lastDispatchedRef.current = parameters;
  }, [parameters, parameterDefinitions, appliedParameterValues, dispatch]);
};

const useObserveAppliedParameters = (
  onParametersChange:
    | ((payload: DashboardParameterChangePayload) => void)
    | undefined,
) => {
  useEffect(() => {
    if (!onParametersChange) {
      return;
    }

    const unsubInitial = startSdkListening({
      actionCreator: fetchDashboard.fulfilled,
      effect: (_action, store) => {
        const payload = buildDashboardChangePayload(
          store.getState(),
          "initial-state",
        );
        if (payload) {
          onParametersChange(payload);
        }
      },
    });

    const unsubManual = startSdkListening({
      predicate: (action, currentState, previousState) => {
        const isParameterChangeAction =
          PARAMETER_CHANGE_ACTION_TYPES.has(action.type) ||
          isParameterSetAction(action);

        if (!isParameterChangeAction) {
          return false;
        }

        return !isEqual(
          getParameterValues(currentState),
          getParameterValues(previousState),
        );
      },
      effect: (_action, store) => {
        const payload = buildDashboardChangePayload(
          store.getState(),
          "manual-change",
        );

        if (payload) {
          onParametersChange(payload);
        }
      },
    });

    return () => {
      unsubInitial();
      unsubManual();
    };
  }, [onParametersChange]);
};

/**
 * Wraps the shared `buildParametersPayload` with dashboard-specific
 * inputs from Redux state. Returns `null` when the dashboard isn't
 * loaded yet — guards against a stray `parameterValues` mutation firing
 * before `fetchDashboard.fulfilled` (which would silently produce an
 * empty `lastUsedParameters` and confuse hosts).
 */
const buildDashboardChangePayload = (
  state: SdkStoreState,
  source: DashboardParameterChangePayload["source"],
): DashboardParameterChangePayload | null => {
  const dashboard = getDashboardComplete(state);

  if (!dashboard) {
    return null;
  }

  return {
    source,
    ...buildParametersPayload(
      getParameterValues(state),
      getParameters(state),
      dashboard.last_used_param_values ?? {},
    ),
  };
};
