import cx from "classnames";
import { type ComponentProps, forwardRef } from "react";

import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/lib/redux";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import type { Parameter } from "metabase-types/api";

export interface DashboardParameterListProps
  extends Pick<
    ComponentProps<typeof ParametersList>,
    | "widgetsVariant"
    | "widgetsWithinPortal"
    | "widgetsPopoverPosition"
    | "vertical"
    | "hasTestIdProps"
  > {
  className?: string;
  parameters: Array<Parameter & { value: unknown }>;
  isSortable?: boolean;
}

export const DashboardParameterList = forwardRef<
  HTMLDivElement,
  DashboardParameterListProps
>(function DashboardParameterList(
  {
    className,
    parameters,
    isSortable = true,
    widgetsVariant = "subtle",
    widgetsWithinPortal,
    widgetsPopoverPosition,
    vertical,
    hasTestIdProps = true,
  },
  ref,
) {
  const dispatch = useDispatch();

  const {
    editingParameter,
    shouldRenderAsNightMode,
    isFullscreen,
    isEditing,
    dashboard,
    hideParameters,
  } = useDashboardContext();

  return (
    <ParametersList
      ref={ref}
      className={cx(DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME, className)}
      parameters={parameters}
      editingParameter={editingParameter}
      hideParameters={hideParameters}
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
      widgetsPopoverPosition={widgetsPopoverPosition}
      vertical={vertical}
      hasTestIdProps={hasTestIdProps}
    />
  );
});
