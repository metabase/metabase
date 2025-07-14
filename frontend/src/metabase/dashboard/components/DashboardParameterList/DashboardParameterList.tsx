import { useDashboardContext } from "metabase/dashboard/context";
import { getValuePopulatedParameters } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";

import {
  ParametersList,
  type ParametersListProps,
} from "../../../parameters/components/ParametersList";

export type DashboardParameterListProps = Pick<ParametersListProps, "vertical">;

export function DashboardParameterList(props: DashboardParameterListProps) {
  const parameters = useSelector(getValuePopulatedParameters);

  const {
    hideParameters,
    isEditing,
    shouldRenderAsNightMode,
    editingParameter,
    dashboard,
    setParameterValue,
    setParameterIndex,
    setParameterValueToDefault,
    setEditingParameter,
    isFullscreen,
  } = useDashboardContext();

  return (
    <ParametersList
      parameters={parameters}
      editingParameter={editingParameter}
      hideParameters={hideParameters}
      dashboard={dashboard}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      isEditing={isEditing}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      setEditingParameter={setEditingParameter}
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior
      {...props}
    />
  );
}
