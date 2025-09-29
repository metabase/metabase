import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { ResponsiveParametersList } from "metabase/query_builder/components/ResponsiveParametersList";
import * as Lib from "metabase-lib";
import type { ParameterId } from "metabase-types/api";

import ParametersListS from "./ParametersList.module.css";

/**
 * Parameters list for SQL questions
 *
 * @function
 * @category InteractiveQuestion
 */
export const QuestionParametersList = () => {
  const { question, originalQuestion, updateQuestion, hiddenParameters } =
    useSdkQuestionContext();

  const isNativeQuestion = useMemo(() => {
    if (!question) {
      return false;
    }

    const { isNative } = Lib.queryDisplayInfo(question.query());

    return isNative;
  }, [question]);

  const query = useMemo(() => question?.legacyNativeQuery(), [question]);

  const parameters = useMemo(() => {
    if (!question || !originalQuestion) {
      return [];
    }

    const originalParameters = originalQuestion.card().parameters ?? [];

    return question
      .parameters()
      .filter(
        ({ id, slug }) =>
          originalParameters.find(
            (originalParameter) => originalParameter.id === id,
          ) && !hiddenParameters?.includes(slug),
      );
  }, [originalQuestion, question, hiddenParameters]);

  if (!question || !query || !isNativeQuestion) {
    return null;
  }

  const setParameterValue = (parameterId: ParameterId, value: string) => {
    const questionWithParams = question.setParameterValues({
      ...question._parameterValues,
      [parameterId]: value,
    });

    updateQuestion(questionWithParams, { run: true });
  };

  const setParameterIndex = (
    parameterId: ParameterId,
    parameterIndex: number,
  ) => {
    const newQuery = query.setParameterIndex(parameterId, parameterIndex);

    updateQuestion(question.setDatasetQuery(newQuery.datasetQuery()));
  };

  return (
    <ResponsiveParametersList
      className={ParametersListS.ParametersList}
      cardId={question.id()}
      dashboardId={question.dashboardId() ?? undefined}
      parameters={parameters}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      enableParameterRequiredBehavior
      commitImmediately={false}
      isSortable={false}
    />
  );
};
