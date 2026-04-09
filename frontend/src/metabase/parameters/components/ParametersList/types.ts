import type {
  DashboardFullscreenControls,
  EmbedHideParametersControls,
} from "metabase/dashboard/types";
import type {
  CardId,
  DashboardId,
  Parameter,
  ParameterId,
} from "metabase-types/api";

import type { ParameterWidgetProps } from "../ParameterWidget";

export type ParametersListProps = {
  parameters: Parameter[];
} & Partial<
  {
    className: string;

    cardId?: CardId;
    dashboardId?: DashboardId;
    editingParameter: Parameter | null | undefined;
    linkedFilterParameters: Parameter[];

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
    widgetsWithinPortal?: boolean;
    widgetsPopoverPosition: ParameterWidgetProps["popoverPosition"];
    layout?: "horizontal" | "vertical";
    hasTestIdProps?: boolean;
  } & Pick<DashboardFullscreenControls, "isFullscreen"> &
    Pick<EmbedHideParametersControls, "hideParameters">
>;
