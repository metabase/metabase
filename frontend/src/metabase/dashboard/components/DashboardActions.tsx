import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction/DashboardEmbedAction";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedThemeControls,
} from "metabase/dashboard/types";
import type { Dashboard } from "metabase-types/api";

import { RefreshWidgetButton } from "./DashboardActions.styled";
import {
  FullscreenToggle,
  NightModeToggleButton,
} from "./DashboardHeader/buttons";

type GetDashboardActionsProps = {
  dashboard: Dashboard | null;
  isEditing?: boolean;
  isEmpty?: boolean;
  isPublic?: boolean;
} & DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  Pick<
    EmbedThemeControls,
    "isNightMode" | "hasNightModeToggle" | "onNightModeChange"
  >;

export const getDashboardActions = ({
  dashboard,
  hasNightModeToggle = false,
  isEditing = false,
  isEmpty = false,
  isFullscreen,
  isNightMode = false,
  isPublic = false,
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  refreshPeriod,
  setRefreshElapsedHook,
}: GetDashboardActionsProps) => {
  if (isEditing) {
    return [];
  }

  const buttons = [];

  const isLoaded = !!dashboard;

  if (!isEmpty && !isPublic && !dashboard?.archived && isLoaded) {
    buttons.push(<DashboardEmbedAction key="dashboard-embed-action" />);
  }

  if (!isEmpty && !dashboard?.archived) {
    buttons.push(
      <RefreshWidgetButton
        key="refresh"
        period={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onChangePeriod={onRefreshPeriodChange}
      />,
    );
  }

  if (
    isFullscreen &&
    !dashboard?.archived &&
    hasNightModeToggle &&
    onNightModeChange
  ) {
    buttons.push(
      <NightModeToggleButton
        key="night"
        isNightMode={isNightMode}
        onNightModeChange={onNightModeChange}
      />,
    );
  }

  if (!isEmpty && (isPublic || isFullscreen)) {
    // option click to enter fullscreen without making the browser go fullscreen
    buttons.push(
      <FullscreenToggle
        key="fullscreen"
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
      />,
    );
  }

  return buttons;
};
