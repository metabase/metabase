import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { useLatest } from "react-use";
import { isEqual } from "underscore";

import {
  buildControlledParameters,
  buildParametersPayload,
} from "embedding-sdk-bundle/lib/controlled-parameters";
import type { SqlParameterChangePayload } from "embedding-sdk-bundle/types/question";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { ParameterValuesMap } from "metabase-types/api";

import type { SqlParameterValues } from "../../types";

type Options = {
  sqlParameters: SqlParameterValues | null | undefined;
  onSqlParametersChange:
    | ((payload: SqlParameterChangePayload) => void)
    | undefined;
  question: Question | undefined;
  parameterValues: ParameterValuesMap;
  updateParameterValues: (next: ParameterValuesMap) => void;
};

export const useSdkControlledSqlParameters = ({
  sqlParameters,
  onSqlParametersChange,
  question,
  parameterValues,
  updateParameterValues,
}: Options) => {
  const metadata = useSelector(getMetadata);

  const parameterDefinitions = useMemo<UiParameter[]>(
    () =>
      question
        ? getCardUiParameters(
            question.card(),
            metadata,
            parameterValues,
            question.parameters() || undefined,
          )
        : [],
    [question, metadata, parameterValues],
  );

  const lastSqlParametersPushRef = useRef<SqlParameterValues | null>(null);

  usePushControlled({
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
    lastSqlParametersPushRef,
  });
};

const usePushControlled = ({
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

const useObserveAppliedSqlParameters = ({
  question,
  parameterDefinitions,
  parameterValues,
  onSqlParametersChange,
  lastSqlParametersPushRef,
}: {
  question: Question | undefined;
  parameterDefinitions: UiParameter[];
  parameterValues: ParameterValuesMap;
  onSqlParametersChange:
    | ((payload: SqlParameterChangePayload) => void)
    | undefined;
  lastSqlParametersPushRef: MutableRefObject<SqlParameterValues | null>;
}) => {
  // Tracks question id change, so we can fire event with `source: initial-state`
  const emittedQuestionIdRef = useRef<unknown>(undefined);
  const emittedValuesRef = useRef<ParameterValuesMap | null>(null);

  const callbackRef = useLatest(onSqlParametersChange);

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

    if (isLoadEvent) {
      callbackRef.current?.({ source: "initial-state", ...payload });

      return;
    }

    const lastSqlParametersPush = lastSqlParametersPushRef.current;
    lastSqlParametersPushRef.current = null;

    if (lastSqlParametersPush !== null) {
      if (!isEqual(payload.parameters, lastSqlParametersPush)) {
        callbackRef.current?.({ source: "auto-change", ...payload });
      }

      return;
    }

    callbackRef.current?.({ source: "manual-change", ...payload });
  }, [
    callbackRef,
    question,
    parameterDefinitions,
    parameterValues,
    lastSqlParametersPushRef,
  ]);
};
