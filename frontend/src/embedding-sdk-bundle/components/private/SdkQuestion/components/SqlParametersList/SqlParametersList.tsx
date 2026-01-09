import { useMemo } from "react";
import { useLatest } from "react-use";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { useSelector } from "metabase/lib/redux";
import { ResponsiveParametersList } from "metabase/query_builder/components/ResponsiveParametersList";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
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
    parameterValues,
    updateParameterValues,
    hiddenParameters,
  } = useSdkQuestionContext();

  const metadata = useSelector(getMetadata);
  // we cannot use `metadata` directly otherwise component will re-run on every metadata change
  const metadataRef = useLatest(metadata);

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

    const uiParameters = getCardUiParameters(
      question.card(),
      metadataRef.current,
      parameterValues,
      question.parameters() || undefined,
    );

    return uiParameters.filter(
      ({ id, slug }) =>
        originalParameters.find(
          (originalParameter) => originalParameter.id === id,
        ) && !hiddenParameters?.includes(slug),
    );
  }, [
    question,
    originalQuestion,
    metadataRef,
    parameterValues,
    hiddenParameters,
  ]);

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
        parameters={parameters}
        setParameterValue={setParameterValue}
        enableParameterRequiredBehavior
        commitImmediately={false}
        isSortable={false}
      />
    </Box>
  );
};
