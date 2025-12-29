import cx from "classnames";
import { type ComponentProps, forwardRef, useMemo } from "react";

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
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

export interface DashboardParameterListProps
  extends Pick<
    ComponentProps<typeof ParametersList>,
    | "widgetsWithinPortal"
    | "widgetsPopoverPosition"
    | "vertical"
    | "hasTestIdProps"
  > {
  className?: string;
  parameters: UiParameter[];
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
    isFullscreen,
    isEditing,
    dashboard,
    hideParameters,
    parameters: dashboardParameters,
    parameterValues,
  } = useDashboardContext();

  const linkedFilterParameters = useMemo(
    () =>
      getValuePopulatedParameters({
        parameters: dashboardParameters,
        values: parameterValues,
      }),
    [dashboardParameters, parameterValues],
  );

  return (
    <ParametersList
      ref={ref}
      className={cx(DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_CLASSNAME, className)}
      parameters={parameters}
      linkedFilterParameters={linkedFilterParameters}
      editingParameter={editingParameter}
      hideParameters={hideParameters}
      dashboardId={dashboard?.id}
      isSortable={isSortable}
      isFullscreen={isFullscreen}
      isEditing={isEditing}
      setParameterValue={(id, value) => dispatch(setParameterValue(id, value))}
      setParameterIndex={(id, index) => dispatch(setParameterIndex(id, index))}
      setEditingParameter={(id) => dispatch(setEditingParameter(id))}
      setParameterValueToDefault={(id) =>
        dispatch(setParameterValueToDefault(id))
      }
      enableParameterRequiredBehavior
      widgetsWithinPortal={widgetsWithinPortal}
      widgetsPopoverPosition={widgetsPopoverPosition}
      vertical={vertical}
      hasTestIdProps={hasTestIdProps}
    />
  );
});
