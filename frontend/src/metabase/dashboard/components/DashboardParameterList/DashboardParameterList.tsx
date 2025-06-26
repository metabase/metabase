import cx from "classnames";
import type { ComponentProps } from "react";

import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME } from "metabase/dashboard/constants";
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

interface DashboardParameterListProps
  extends Pick<
    ComponentProps<typeof ParametersList>,
    "widgetsVariant" | "widgetsWithinPortal" | "vertical"
  > {
  className?: string;
  parameters: Array<Parameter & { value: unknown }>;
  isSortable?: boolean;
  isFullscreen: boolean;
}

export function DashboardParameterList({
  className,
  parameters,
  isSortable = true,
  isFullscreen,
  widgetsVariant,
  widgetsWithinPortal,
  vertical,
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
      className={cx(DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME, className)}
      parameters={parameters}
      editingParameter={editingParameter}
      hideParameters={hiddenParameterSlugs}
      dashboard={dashboard}
      isSortable={isSortable}
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
      widgetsVariant={widgetsVariant}
      widgetsWithinPortal={widgetsWithinPortal}
      vertical={vertical}
    />
  );
}
