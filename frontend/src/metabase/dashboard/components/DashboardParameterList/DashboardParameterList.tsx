import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getEditingParameter,
  getValuePopulatedParameters,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { ParametersList } from "../../../parameters/components/ParametersList";

interface DashboardParameterListProps {
  isFullscreen: boolean;
}

export function DashboardParameterList({
  isFullscreen,
}: DashboardParameterListProps) {
  const parameters = useSelector(getValuePopulatedParameters);
  const editingParameter = useSelector(getEditingParameter);
  const dispatch = useDispatch();

  const { hideParameters, isEditing, shouldRenderAsNightMode, dashboard } =
    useDashboardContext();

  return (
    <ParametersList
      parameters={parameters}
      editingParameter={editingParameter}
      hideParameters={hideParameters}
      dashboard={dashboard}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      isEditing={isEditing}
      setParameterValue={(id, value) => dispatch(setParameterValue(id, value))}
      setParameterIndex={(id, index) => dispatch(setParameterIndex(id, index))}
      setEditingParameter={(id) => dispatch(setEditingParameter(id))}
      setParameterValueToDefault={(id) =>
        dispatch(setParameterValueToDefault(id))
      }
      enableParameterRequiredBehavior
    />
  );
}
