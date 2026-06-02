import { updateQuestion } from "metabase/query_builder/actions/core";
import { ResponsiveParametersList } from "metabase/query_builder/components/ResponsiveParametersList";
import { useDispatch } from "metabase/redux";
import type { ParameterId } from "metabase-types/api";

import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

/**
 * The list of native query parameters (template tag values) shown in the top
 * bar. Renders nothing when the consumer did not provide `setParameterValue`.
 */
export function ParametersList() {
  const { question, query, setParameterValue } = useNativeQueryEditorContext();
  const dispatch = useDispatch();

  if (!setParameterValue) {
    return null;
  }

  const setParameterIndex = (
    parameterId: ParameterId,
    parameterIndex: number,
  ) => {
    const newQuery = query.setParameterIndex(parameterId, parameterIndex);
    dispatch(updateQuestion(question.setDatasetQuery(newQuery.datasetQuery())));
  };

  return (
    <ResponsiveParametersList
      cardId={question.id()}
      dashboardId={question.getDashboardProps().dashboardId}
      parameters={question.parameters()}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      enableParameterRequiredBehavior
    />
  );
}
