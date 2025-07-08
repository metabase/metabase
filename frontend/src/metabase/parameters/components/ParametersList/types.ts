import type {
  DashboardFullscreenControls,
  DashboardNightModeControls,
  EmbedHideParametersControls,
} from "metabase/dashboard/types";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";

import type { ParameterWidgetProps } from "../ParameterWidget";

export type ParametersListProps = {
  parameters: Parameter[];
} & Partial<
  {
    className: string;

    question: Question;
    dashboard: Dashboard | null;
    editingParameter: Parameter | null | undefined;

    isEditing: boolean;
    isSortable?: boolean;
    vertical: boolean;
    commitImmediately: boolean;
    setParameterValue: (parameterId: ParameterId, value: any) => void;
    setParameterValueToDefault: (parameterId: ParameterId) => void;
    setParameterIndex: (
      parameterId: ParameterId,
      parameterIndex: number,
    ) => void;
    setEditingParameter: (parameterId: ParameterId | null) => void;
    enableParameterRequiredBehavior: boolean;
    widgetsVariant?: "default" | "subtle";
    widgetsWithinPortal?: boolean;
    widgetsPopoverPosition: ParameterWidgetProps["popoverPosition"];
    layout?: "horizontal" | "vertical";
    hasTestIdProps?: boolean;
  } & Pick<DashboardFullscreenControls, "isFullscreen"> &
    Pick<DashboardNightModeControls, "isNightMode"> &
    Pick<EmbedHideParametersControls, "hideParameters">
>;
