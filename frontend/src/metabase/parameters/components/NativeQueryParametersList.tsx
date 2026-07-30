import { useNativeQueryEditorContext } from "metabase/querying/components/NativeQueryEditor/context/NativeQueryEditorContext";
import type { ParameterId } from "metabase-types/api";

import { ResponsiveParametersList } from "./ResponsiveParametersList";

/**
 * The list of native query parameters (template tag values) shown in the top
 * bar. Renders nothing when the consumer did not provide `setParameterValue`.
 */
export function NativeQueryParametersList() {
  const { question, query, setDatasetQuery, setParameterValue } =
    useNativeQueryEditorContext();

  if (!setParameterValue) {
    return null;
  }

  const setParameterIndex = (
    parameterId: ParameterId,
    parameterIndex: number,
  ) => {
    setDatasetQuery(query.setParameterIndex(parameterId, parameterIndex));
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
