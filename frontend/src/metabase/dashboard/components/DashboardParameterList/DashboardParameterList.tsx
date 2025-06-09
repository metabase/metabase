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
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Parameter } from "metabase-types/api";

import { ParametersList } from "../../../parameters/components/ParametersList";

interface DashboardParameterListProps {
  parameters: Array<Parameter & { value: unknown }>;
  isFullscreen: boolean;
}

export function DashboardParameterList({
  parameters,
  isFullscreen,
}: DashboardParameterListProps) {
  const dashboard = useSelector(getDashboardComplete);
  const editingParameter = useSelector(getEditingParameter);
  const hiddenParameterSlugs = useSelector(getTabHiddenParameterSlugs);
  const isEditing = useSelector(getIsEditing);
  const isNightMode = useSelector(getIsNightMode);
  const shouldRenderAsNightMode = isNightMode && isFullscreen;
  const dispatch = useDispatch();

  return (
    <ParametersList
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
