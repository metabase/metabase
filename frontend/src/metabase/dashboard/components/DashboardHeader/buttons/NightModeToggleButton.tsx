import { t } from "ttag";

import type { EmbedNightModeControls } from "metabase/dashboard/types";

import { DashboardHeaderButton } from "../DashboardHeaderButton";

export const NightModeToggleButton = ({
  isNightMode,
  onNightModeChange,
}: Pick<EmbedNightModeControls, "isNightMode" | "onNightModeChange">) => {
  const label = isNightMode ? t`Daytime mode` : t`Nighttime mode`;
  return (
    <DashboardHeaderButton
      icon={isNightMode ? "sun" : "moon"}
      onClick={() => onNightModeChange?.(!isNightMode)}
      tooltipLabel={label}
      aria-label={label}
    />
  );
};
