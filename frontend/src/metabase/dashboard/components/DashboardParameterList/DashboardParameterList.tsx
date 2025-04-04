import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getEditingParameter,
  getIsEditing,
  getIsNightMode,
  getTabHiddenParameterSlugs,
  getValuePopulatedParameters,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { ParametersList } from "../../../parameters/components/ParametersList";

interface DashboardParameterListProps {
  isFullscreen: boolean;
  className?: string;
}

export function DashboardParameterList({
  isFullscreen,
  className,
}: DashboardParameterListProps) {
  const dashboard = useSelector(getDashboardComplete);
  const parameters = useSelector(getValuePopulatedParameters);
  const editingParameter = useSelector(getEditingParameter);
  const hiddenParameterSlugs = useSelector(getTabHiddenParameterSlugs);
  const isEditing = useSelector(getIsEditing);
  const isNightMode = useSelector(getIsNightMode);
  const shouldRenderAsNightMode = isNightMode && isFullscreen;
  const dispatch = useDispatch();

  return (
    <ParametersList
      className={className}
      parameters={parameters}
      editingParameter={editingParameter}
      hideParameters={hiddenParameterSlugs}
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
