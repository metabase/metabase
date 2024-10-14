import type { HandleThunkActionCreator } from "react-redux";

import type { setParameterValue as setParameterValueDashboardAction } from "metabase/dashboard/actions";
import type {
  DashboardFullscreenControls,
  DashboardNightModeControls,
  EmbedHideParametersControls,
} from "metabase/dashboard/types";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, Parameter, ParameterId } from "metabase-types/api";

export type ParametersListProps = {
  parameters: Parameter[];
} & Partial<
  {
    className: string;

    question: Question;
    dashboard: Dashboard | null;
    editingParameter: Parameter | null | undefined;

    isEditing: boolean;
    vertical: boolean;
    commitImmediately: boolean;
    setParameterValue: HandleThunkActionCreator<
      typeof setParameterValueDashboardAction
    >;
    setParameterValueToDefault: (parameterId: ParameterId) => void;
    setParameterIndex: (
      parameterId: ParameterId,
      parameterIndex: number,
    ) => void;
    setEditingParameter: (parameterId: ParameterId | null) => void;
    enableParameterRequiredBehavior: boolean;
  } & Pick<DashboardFullscreenControls, "isFullscreen"> &
    Pick<DashboardNightModeControls, "isNightMode"> &
    Pick<EmbedHideParametersControls, "hideParameters">
>;
