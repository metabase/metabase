import { useCallback } from "react";
import { t } from "ttag";

import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { Box, Popover, Icon, Tooltip, Stack, Switch } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";


const EXTRA_BUTTONS_DESCRIPTION = t`Toggle width`;

interface ExtraEditButtonsMenuProps {
  key: string;
  setDashboardAttribute: <Key extends keyof Dashboard>(
    key: Key,
    value: Dashboard[Key],
  ) => void;
  dashboard: Dashboard;
}

export function ExtraEditButtonsMenu({
  key,
  setDashboardAttribute,
  dashboard,
}: ExtraEditButtonsMenuProps) {
  return (
    <Popover key={key} shadow="sm" position="bottom-end" offset={5}>
      <Popover.Target>
        <Box>
          <Tooltip label={EXTRA_BUTTONS_DESCRIPTION}>
            <DashboardHeaderButton aria-label={EXTRA_BUTTONS_DESCRIPTION}>
              <Icon name="ellipsis" size={18} />
            </DashboardHeaderButton>
          </Tooltip>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack>
          <WidthToggle
            dashboard={dashboard}
            setDashboardAttribute={setDashboardAttribute}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

interface WidthToggleProps {
  setDashboardAttribute: <Key extends keyof Dashboard>(
    key: Key,
    value: Dashboard[Key],
  ) => void;
  dashboard: Dashboard;
}

function WidthToggle({ setDashboardAttribute, dashboard }: WidthToggleProps) {
  const isToggleChecked = dashboard?.width === "full";

  const handleWidthToggleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const width = event.currentTarget.checked ? "full" : "fixed";
      setDashboardAttribute("width", width);
    },
    [setDashboardAttribute],
  );

  return (
    <Box px="md" py="sm">
      <Switch
        size="sm"
        checked={isToggleChecked}
        onChange={handleWidthToggleChange}
        label={t`Full width`}
      />
    </Box>
  );
}
