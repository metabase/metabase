import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getTabHiddenParameterSlugs,
  getValuePopulatedParameters,
} from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { ParametersList } from "../../../parameters/components/ParametersList";

export function DashboardParameterList() {
  const parameters = useSelector(getValuePopulatedParameters);
  const hiddenParameterSlugs = useSelector(getTabHiddenParameterSlugs);
  const dispatch = useDispatch();

  const {
    editingParameter,
    shouldRenderAsNightMode,
    isFullscreen,
    isEditing,
    dashboard,
  } = useDashboardContext();

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
