import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { ResponsiveParametersList } from "metabase/query_builder/components/ResponsiveParametersList";
import * as Lib from "metabase-lib";
import type { ParameterId } from "metabase-types/api";

import SqlParametersListS from "./SqlParametersList.module.css";

/**
 * Parameters list for SQL questions
 *
 * @function
 * @category InteractiveQuestion
 */
export const SqlParametersList = () => {
  const { question, originalQuestion, updateQuestion, hiddenParameters } =
    useSdkQuestionContext();

  const isNativeQuestion = useMemo(() => {
    if (!question) {
      return false;
    }

    const { isNative } = Lib.queryDisplayInfo(question.query());

    return isNative;
  }, [question]);

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

  if (!question || !isNativeQuestion) {
    return null;
  }

  const setParameterValue = (parameterId: ParameterId, value: string) => {
    const questionWithParams = question.setParameterValues({
      ...question._parameterValues,
      [parameterId]: value,
    });

    updateQuestion(questionWithParams, { run: true });
  };

  return (
    <ResponsiveParametersList
      className={SqlParametersListS.SqlParametersList}
      cardId={question.id()}
      dashboardId={question.dashboardId() ?? undefined}
      parameters={parameters}
      setParameterValue={setParameterValue}
      enableParameterRequiredBehavior
      commitImmediately={false}
      isSortable={false}
    />
  );
};
