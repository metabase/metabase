import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { ResponsiveParametersList } from "metabase/query_builder/components/ResponsiveParametersList";
import { Box } from "metabase/ui";
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
  const {
    question,
    originalQuestion,
    token,
    parameterValues,
    updateParameterValues,
    hiddenParameters,
  } = useSdkQuestionContext();

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
  }, [question, originalQuestion, hiddenParameters]);

  if (!question || !isNativeQuestion || !parameters.length) {
    return null;
  }

  const setParameterValue = (parameterId: ParameterId, value: string) => {
    const nextParameterValues = {
      ...parameterValues,
      [parameterId]: value,
    };

    updateParameterValues(nextParameterValues);
  };

  return (
    <Box w="100%">
      <ResponsiveParametersList
        classNames={{
          container: SqlParametersListS.SqlParametersListContainer,
          parametersList: SqlParametersListS.SqlParametersList,
        }}
        cardId={question.id()}
        dashboardId={question.dashboardId() ?? undefined}
        token={token}
        parameters={parameters}
        setParameterValue={setParameterValue}
        enableParameterRequiredBehavior
        commitImmediately={false}
        isSortable={false}
      />
    </Box>
  );
};
