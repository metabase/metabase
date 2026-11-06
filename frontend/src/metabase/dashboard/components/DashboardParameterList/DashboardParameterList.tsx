import { type ComponentProps, forwardRef } from "react";

import {
  setEditingParameter,
  setParameterIndex,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useLinkedFilterParameters } from "metabase/dashboard/hooks";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import { useDispatch } from "metabase/redux";
import type { UiParameter } from "metabase-lib/v1/parameters/types";

export interface DashboardParameterListProps extends Pick<
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
  } = useDashboardContext();
  const linkedFilterParameters = useLinkedFilterParameters();

  return (
    <ParametersList
      ref={ref}
      className={className}
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
