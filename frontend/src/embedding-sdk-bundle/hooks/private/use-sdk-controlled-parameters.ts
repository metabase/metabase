import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { useLatest } from "react-use";
import { isEqual } from "underscore";

import {
  buildControlledParameters,
  buildParametersPayload,
} from "embedding-sdk-bundle/lib/controlled-parameters";
import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import {
  type SdkListenerEffect,
  type SdkListenerPredicate,
  startSdkListening,
} from "embedding-sdk-bundle/store/listener-middleware";
import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import type { ParameterChangePayload } from "embedding-sdk-bundle/types/dashboard";
import {
  REMOVE_PARAMETER,
  RESET_PARAMETERS,
  SET_PARAMETER_VALUE,
  fetchDashboard,
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
  parameters: ParameterValues | null | undefined;
  onParametersChange: ((payload: ParameterChangePayload) => void) | undefined;
};

const PARAMETER_CHANGE_ACTION_TYPES = new Set<string>([
  SET_PARAMETER_VALUES,
  RESET_PARAMETERS,
  REMOVE_PARAMETER,
]);

const isParameterSetAction = (action: {
  type: string;
  payload?: unknown;
}): boolean =>
  action.type === SET_PARAMETER_VALUE &&
  // We must not fire `change` handler on draft parameter updates
  (action.payload as { isDraft?: boolean } | undefined)?.isDraft === false;

/**
 * Wires up the controlled `parameters` prop and `onParametersChange` callback
 * for `<InteractiveDashboard>`. Splits into a push hook (host => Redux) and an
 * observe hook (Redux => host); the shared ref lets the observer attribute a
 * change to the host's own push and pick `auto-change` instead of
 * `manual-change`.
 */
export const useSdkControlledParameters = ({
  parameters,
  onParametersChange,
}: Options) => {
  const lastParametersPushRef = useRef<ParameterValues | null>(null);

  usePushControlledParameters(parameters, lastParametersPushRef);
  useObserveAppliedParameters(onParametersChange, lastParametersPushRef);
};

/**
 * Pushes the host's controlled `parameters` prop into the dashboard's Redux
 * store whenever it changes. Skips the dispatch when the resolved values
 * already match what's applied.
 */
const usePushControlledParameters = (
  parameters: ParameterValues | null | undefined,
  lastParametersPushRef: MutableRefObject<ParameterValues | null>,
) => {
  const dispatch = useSdkDispatch();
  const parameterDefinitions = useSdkSelector(getParameters);
  const appliedParameterValues = useSdkSelector(getParameterValues);
  // To skip redundant dispatches when `parameters` reference didn't change
  // but the effect re-fired (e.g. `parameterDefinitions` got a new reference from a refetch with the same content)
  const lastDispatchedRef = useRef<ParameterValues | undefined>(undefined);

  useEffect(() => {
    if (parameters === null || parameters === undefined) {
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
      lastParametersPushRef.current = parameters;
      dispatch(setParameterValues(next));
    }

    lastDispatchedRef.current = parameters;
  }, [
    parameters,
    parameterDefinitions,
    appliedParameterValues,
    dispatch,
    lastParametersPushRef,
  ]);
};

/**
 * Subscribes to dashboard parameter mutations in Redux and fires
 * `onParametersChange` with the right `source`: `initial-state` (post-load),
 * `auto-change` (host's push reshaped en route — payload differs from
 * `lastParametersPushRef`), or `manual-change` (everything else, e.g. user
 * widget edit).
 */
const useObserveAppliedParameters = (
  onParametersChange: ((payload: ParameterChangePayload) => void) | undefined,
  lastParametersPushRef: MutableRefObject<ParameterValues | null>,
) => {
  const onParametersChangeRef = useLatest(onParametersChange);

  const handleInitialStateAction = useCallback<SdkListenerEffect>(
    (_action, listenerApi) => {
      const payload = buildDashboardChangePayload(
        listenerApi.getState(),
        "initial-state",
      );

      if (payload) {
        onParametersChangeRef.current?.(payload);
      }
    },
    [onParametersChangeRef],
  );

  const isParameterValueChangeAction = useCallback<SdkListenerPredicate>(
    (action, currentState, previousState) => {
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
    [],
  );

  const handleManualChangeAction = useCallback<SdkListenerEffect>(
    (_action, listenerApi) => {
      const state = listenerApi.getState();
      const lastParametersPush = lastParametersPushRef.current;
      lastParametersPushRef.current = null;

      if (lastParametersPush !== null) {
        const payload = buildDashboardChangePayload(state, "auto-change");

        if (payload && !isEqual(payload.parameters, lastParametersPush)) {
          onParametersChangeRef.current?.(payload);
        }

        return;
      } else {
        const payload = buildDashboardChangePayload(state, "manual-change");

        if (payload) {
          onParametersChangeRef.current?.(payload);
        }
      }
    },
    [onParametersChangeRef, lastParametersPushRef],
  );

  useEffect(() => {
    const unsubInitial = startSdkListening({
      actionCreator: fetchDashboard.fulfilled,
      effect: handleInitialStateAction,
    });

    const unsubManual = startSdkListening({
      predicate: isParameterValueChangeAction,
      effect: handleManualChangeAction,
    });

    return () => {
      unsubInitial();
      unsubManual();
    };
  }, [
    handleInitialStateAction,
    isParameterValueChangeAction,
    handleManualChangeAction,
  ]);
};

const buildDashboardChangePayload = (
  state: SdkStoreState,
  source: ParameterChangePayload["source"],
): ParameterChangePayload | null => {
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
