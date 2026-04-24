import { useEffect, useMemo, useRef } from "react";
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
  sqlParameters: SqlParameterValues | undefined;
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

  // `parameterValues` is in deps because `getCardUiParameters` reads
  // applied values to populate `.value` and resolve dependent-widget
  // option lists — defs ref churns whenever applied state changes. Push
  // hook's `lastDispatchedRef` guards against that, observe hook
  // re-runs but its inner `isEqual` short-circuits no-op cases.
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

  usePushControlled({
    sqlParameters,
    parameterDefinitions,
    appliedParameterValues: parameterValues,
    updateParameterValues,
  });
  useObserveAppliedSqlParameters({
    question,
    parameterDefinitions,
    parameterValues,
    onSqlParametersChange,
  });
};

const usePushControlled = ({
  sqlParameters,
  parameterDefinitions,
  appliedParameterValues,
  updateParameterValues,
}: {
  sqlParameters: SqlParameterValues | undefined;
  parameterDefinitions: UiParameter[];
  appliedParameterValues: ParameterValuesMap;
  updateParameterValues: (next: ParameterValuesMap) => void;
}) => {
  // To skip redundant dispatches when `parameters` reference didn't change
  // but the effect re-fired (e.g. `parameterDefinitions` got a new reference from a refetch with the same content)
  const lastDispatchedRef = useRef<SqlParameterValues | undefined>(undefined);

  useEffect(() => {
    if (sqlParameters === undefined) {
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
      updateParameterValues(next);
    }

    lastDispatchedRef.current = sqlParameters;
  }, [
    sqlParameters,
    parameterDefinitions,
    appliedParameterValues,
    updateParameterValues,
  ]);
};

const useObserveAppliedSqlParameters = ({
  question,
  parameterDefinitions,
  parameterValues,
  onSqlParametersChange,
}: {
  question: Question | undefined;
  parameterDefinitions: UiParameter[];
  parameterValues: ParameterValuesMap;
  onSqlParametersChange:
    | ((payload: SqlParameterChangePayload) => void)
    | undefined;
}) => {
  // Discriminator for `'initial-state'` vs `'manual-change'`. Tracking
  // by `question.id()` (or `null` for new/native) instead of the Question
  // object ref — `mergeQuestionState` produces a new Question reference
  // multiple times during the normal load + query flow (post-resolve,
  // post-query-result, etc.), and we'd misclassify each one as a fresh
  // load. The id stays stable across those mergeQuestionState passes and
  // only changes on actual question switch (navigateToNewCard,
  // replaceQuestion).
  const emittedQuestionIdRef = useRef<unknown>(undefined);
  const emittedValuesRef = useRef<ParameterValuesMap | null>(null);

  useEffect(() => {
    if (
      !onSqlParametersChange ||
      !question ||
      parameterDefinitions.length === 0
    ) {
      return;
    }

    const questionId = question.id?.() ?? null;
    const isLoadEvent = emittedQuestionIdRef.current !== questionId;

    if (!isLoadEvent && isEqual(emittedValuesRef.current, parameterValues)) {
      return;
    }

    emittedQuestionIdRef.current = questionId;
    emittedValuesRef.current = parameterValues;

    onSqlParametersChange({
      source: isLoadEvent ? "initial-state" : "manual-change",
      ...buildParametersPayload(parameterValues, parameterDefinitions),
    });
  }, [onSqlParametersChange, question, parameterDefinitions, parameterValues]);
};
