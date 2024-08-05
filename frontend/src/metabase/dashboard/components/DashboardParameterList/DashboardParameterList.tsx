import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getDraftParameterValues,
  getEditingParameter,
  getIsAutoApplyFilters,
  getIsEditing,
  getIsNightMode,
  getParameters,
  getParameterValues,
  getTabHiddenParameterSlugs,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

interface DashboardParameterListProps {
  isFullscreen: boolean;
}

export function DashboardParameterList({
  isFullscreen,
}: DashboardParameterListProps) {
  const dashboard = useSelector(getDashboardComplete);
  const parameters = useSelector(getParameters);
  const parameterValues = useSelector(getParameterValues);
  const draftParameterValues = useSelector(getDraftParameterValues);
  const editingParameter = useSelector(getEditingParameter);
  const hiddenParameterSlugs = useSelector(getTabHiddenParameterSlugs);
  const isEditing = useSelector(getIsEditing);
  const isAutoApplyFilters = useSelector(getIsAutoApplyFilters);
  const isNightMode = useSelector(getIsNightMode);
  const shouldRenderAsNightMode = isNightMode && isFullscreen;
  const dispatch = useDispatch();

  return (
    <SyncedParametersList
      parameters={getValuePopulatedParameters({
        parameters,
        values: isAutoApplyFilters ? parameterValues : draftParameterValues,
      })}
      editingParameter={editingParameter}
      hideParameters={hiddenParameterSlugs}
      dashboard={dashboard}
      isFullscreen={isFullscreen}
      isNightMode={shouldRenderAsNightMode}
      isEditing={isEditing}
      setParameterValue={(id, value) => dispatch(setParameterValue(id, value))}
      setParameterIndex={(id, index) => dispatch(setParameterIndex(id, index))}
      setEditingParameter={id => dispatch(setEditingParameter(id))}
      setParameterValueToDefault={id =>
        dispatch(setParameterValueToDefault(id))
      }
      enableParameterRequiredBehavior
    />
  );
}
