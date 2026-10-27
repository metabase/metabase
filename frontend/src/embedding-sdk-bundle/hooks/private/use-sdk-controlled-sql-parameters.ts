import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { useLatest } from "react-use";
import { isEqual } from "underscore";

import {
  buildClickParameters,
  buildControlledParameters,
  buildParametersPayload,
} from "embedding-sdk-bundle/lib/controlled-parameters";
import type { SqlParameterChangePayload } from "embedding-sdk-bundle/types/question";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { ParameterValuesMap } from "metabase-types/api";

import type { SqlParameterValues } from "../../types";

export type NavigatedSqlEntityOptions = {
  rawClickParameters: SqlParameterValues;
  onParametersChange: (
    payload: SqlParameterChangePayload & {
      clickParameters: SqlParameterValues;
    },
  ) => void;
};

type Options = {
  sqlParameters: SqlParameterValues | null | undefined;
  onSqlParametersChange:
    | ((payload: SqlParameterChangePayload) => void)
    | undefined;
  navigatedEntity?: NavigatedSqlEntityOptions;
  question: Question | undefined;
  parameterValues: ParameterValuesMap;
  updateParameterValues: (next: ParameterValuesMap) => void;
};

/**
 * Wires up the controlled `sqlParameters` prop and `onSqlParametersChange`
 * callback for `<InteractiveQuestion>` (SQL questions only). Splits into a
 * push hook (host => query state) and an observe hook (state => host); the
 * shared ref lets the observer attribute a change to the host's own push
 * and pick `auto-change` instead of `manual-change`.
 */
export const useSdkControlledSqlParameters = ({
  sqlParameters,
  onSqlParametersChange,
  navigatedEntity,
  question,
  parameterValues,
  updateParameterValues,
}: Options) => {
  const parameterDefinitions = useMemo<UiParameter[]>(
    () =>
      question ? question.setParameterValues(parameterValues).parameters() : [],
    [question, parameterValues],
  );

  const lastSqlParametersPushRef = useRef<SqlParameterValues | null>(null);

  usePushControlledSqlParameters({
    sqlParameters,
    parameterDefinitions,
    appliedParameterValues: parameterValues,
    updateParameterValues,
    lastSqlParametersPushRef,
  });
  useObserveAppliedSqlParameters({
    question,
    parameterDefinitions,
    parameterValues,
    onSqlParametersChange,
    navigatedEntity,
    lastSqlParametersPushRef,
  });
};

/**
 * Pushes the host's controlled `sqlParameters` prop into the question's
 * applied values whenever it changes. Skips the dispatch when the resolved
 * values already match what's applied.
 */
const usePushControlledSqlParameters = ({
  sqlParameters,
  parameterDefinitions,
  appliedParameterValues,
  updateParameterValues,
  lastSqlParametersPushRef,
}: {
  sqlParameters: SqlParameterValues | null | undefined;
  parameterDefinitions: UiParameter[];
  appliedParameterValues: ParameterValuesMap;
  updateParameterValues: (next: ParameterValuesMap) => void;
  lastSqlParametersPushRef: MutableRefObject<SqlParameterValues | null>;
}) => {
  // To skip redundant dispatches when `parameters` reference didn't change
  // but the effect re-fired (e.g. `parameterDefinitions` got a new reference from a refetch with the same content)
  const lastDispatchedRef = useRef<SqlParameterValues | undefined>(undefined);

  useEffect(() => {
    if (sqlParameters === null || sqlParameters === undefined) {
      lastDispatchedRef.current = undefined;

      return;
    }

    if (
      lastDispatchedRef.current === sqlParameters ||
      parameterDefinitions.length === 0
    ) {
      return;
    }

    const next = buildControlledParameters(sqlParameters, parameterDefinitions);

    if (!isEqual(next, appliedParameterValues)) {
      lastSqlParametersPushRef.current = sqlParameters;
      updateParameterValues(next);
    }

    lastDispatchedRef.current = sqlParameters;
  }, [
    sqlParameters,
    parameterDefinitions,
    appliedParameterValues,
    updateParameterValues,
    lastSqlParametersPushRef,
  ]);
};

/**
 * Observes applied SQL parameter values and fires `onSqlParametersChange`
 * with the right `source`: `initial-state` (first sighting of a question),
 * `auto-change` (host's push reshaped en route — payload differs from
 * `lastSqlParametersPushRef`), or `manual-change` (everything else, e.g.
 * user widget edit).
 */
const useObserveAppliedSqlParameters = ({
  question,
  parameterDefinitions,
  parameterValues,
  onSqlParametersChange,
  navigatedEntity,
  lastSqlParametersPushRef,
}: {
  question: Question | undefined;
  parameterDefinitions: UiParameter[];
  parameterValues: ParameterValuesMap;
  onSqlParametersChange:
    | ((payload: SqlParameterChangePayload) => void)
    | undefined;
  navigatedEntity: NavigatedSqlEntityOptions | undefined;
  lastSqlParametersPushRef: MutableRefObject<SqlParameterValues | null>;
}) => {
  // Tracks question id change, so we can fire event with `source: initial-state`
  const emittedQuestionIdRef = useRef<unknown>(undefined);
  const emittedValuesRef = useRef<ParameterValuesMap | null>(null);

  const callbackRef = useLatest(onSqlParametersChange);
  const navigatedEntityRef = useLatest(navigatedEntity);

  useEffect(() => {
    if (!question || parameterDefinitions.length === 0) {
      return;
    }

    const questionId = question.id?.() ?? null;
    const isLoadEvent = emittedQuestionIdRef.current !== questionId;

    if (!isLoadEvent && isEqual(emittedValuesRef.current, parameterValues)) {
      return;
    }

    emittedQuestionIdRef.current = questionId;
    emittedValuesRef.current = parameterValues;

    const payload = buildParametersPayload(
      parameterValues,
      parameterDefinitions,
    );

    const emit = (source: SqlParameterChangePayload["source"]) => {
      const event = { source, ...payload };
      callbackRef.current?.(event);

      const navigated = navigatedEntityRef.current;
      navigated?.onParametersChange({
        ...event,
        clickParameters: buildClickParameters(
          navigated.rawClickParameters,
          parameterDefinitions,
        ),
      });
    };

    if (isLoadEvent) {
      emit("initial-state");

      return;
    }

    const lastSqlParametersPush = lastSqlParametersPushRef.current;
    lastSqlParametersPushRef.current = null;

    if (lastSqlParametersPush !== null) {
      if (!isEqual(payload.parameters, lastSqlParametersPush)) {
        emit("auto-change");
      }

      return;
    }

    emit("manual-change");
  }, [
    callbackRef,
    navigatedEntityRef,
    question,
    parameterDefinitions,
    parameterValues,
    lastSqlParametersPushRef,
  ]);
};
