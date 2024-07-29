import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { NightModeButtonIcon } from "metabase/dashboard/components/DashboardActions.styled";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import type { DashboardNightModeControls } from "metabase/dashboard/types";

export const NightModeToggleButton = ({
  isNightMode,
  onNightModeChange,
}: Pick<DashboardNightModeControls, "isNightMode" | "onNightModeChange">) => (
  <Tooltip tooltip={isNightMode ? t`Daytime mode` : t`Nighttime mode`}>
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
