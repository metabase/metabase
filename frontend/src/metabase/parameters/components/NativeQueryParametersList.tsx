import { useNativeQueryEditorContext } from "metabase/querying/components/NativeQueryEditor/context/NativeQueryEditorContext";
import { setTemplateTagIndex } from "metabase/querying/native";
import type { ParameterId } from "metabase-types/api";

import { ResponsiveParametersList } from "./ResponsiveParametersList";

/**
 * The list of native query parameters (template tag values). Renders nothing
 * when the editor context has no `setParameterValue`.
 */
export function NativeQueryParametersList() {
  const { question, query, setQuery, setParameterValue } =
    useNativeQueryEditorContext();

  if (!setParameterValue) {
    return null;
  }

  const setParameterIndex = (
    parameterId: ParameterId,
    parameterIndex: number,
  ) => {
    setQuery(setTemplateTagIndex(query, parameterId, parameterIndex));
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
