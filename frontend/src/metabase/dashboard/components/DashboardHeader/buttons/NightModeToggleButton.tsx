import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import type { DashboardNightModeControls } from "metabase/dashboard/types";

export const NightModeToggleButton = ({
  isNightMode,
  onNightModeChange,
}: Pick<DashboardNightModeControls, "isNightMode" | "onNightModeChange">) => {
  const label = isNightMode ? t`Daytime mode` : t`Nighttime mode`;
  return (
    <ToolbarButton
      icon={isNightMode ? "sun" : "moon"}
      onClick={() => onNightModeChange?.(!isNightMode)}
      tooltipLabel={label}
      aria-label={label}
    />
  );
};
