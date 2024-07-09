import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { DashboardEmbedAction } from "metabase/dashboard/components/DashboardEmbedAction/DashboardEmbedAction";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedThemeControls,
} from "metabase/dashboard/types";
import type { Dashboard } from "metabase-types/api";

import {
  FullScreenButtonIcon,
  NightModeButtonIcon,
  RefreshWidgetButton,
} from "./DashboardActions.styled";

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

const NightModeToggleButton = ({
  isNightMode,
  onNightModeChange,
}: {
  isNightMode: boolean | undefined;
  onNightModeChange: (isNightMode: boolean) => void;
}) => (
  <Tooltip
    key="night"
    tooltip={isNightMode ? t`Daytime mode` : t`Nighttime mode`}
  >
    <span>
      <DashboardHeaderButton
        icon={
          <NightModeButtonIcon
            isNightMode={isNightMode}
            onClick={() => onNightModeChange(!isNightMode)}
          />
        }
      />
    </span>
  </Tooltip>
);

const FullscreenToggle = ({
  isFullscreen,
  onFullscreenChange,
}: DashboardFullscreenControls) => (
  <Tooltip
    key="fullscreen"
    tooltip={isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`}
  >
    <span>
      <DashboardHeaderButton
        icon={<FullScreenButtonIcon isFullscreen={isFullscreen} />}
        onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
      />
    </span>
  </Tooltip>
);

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
        isNightMode={isNightMode}
        onNightModeChange={onNightModeChange}
      />,
    );
  }

  if (!isEmpty && (isPublic || isFullscreen)) {
    // option click to enter fullscreen without making the browser go fullscreen
    buttons.push(
      <FullscreenToggle
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
      />,
    );
  }

  return buttons;
};
