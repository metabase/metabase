import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { NightModeButtonIcon } from "metabase/dashboard/components/DashboardActions.styled";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";

export const NightModeToggleButton = ({
  isNightMode,
  onNightModeChange,
}: {
  isNightMode: boolean | undefined;
  onNightModeChange: (isNightMode: boolean) => void;
}) => (
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
