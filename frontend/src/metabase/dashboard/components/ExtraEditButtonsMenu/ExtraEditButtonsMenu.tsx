import { t } from "ttag";
import { Box, Popover, Icon, Tooltip, Stack, Switch } from "metabase/ui";
import { setDashboardWidth } from "metabase/dashboard/actions";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { useDispatch } from "metabase/lib/redux";
import type { Dashboard } from "metabase-types/api";

const EXTRA_BUTTONS_DESCRIPTION = t`Toggle width`;

interface ExtraEditButtonsMenuProps {
  dashboard: Dashboard;
}

export function ExtraEditButtonsMenu({ dashboard }: ExtraEditButtonsMenuProps) {
  const dispatch = useDispatch();

  const handleToggleWidth = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextWidth = event.currentTarget.checked ? "full" : "fixed";
    dispatch(setDashboardWidth(nextWidth));
  };

  return (
    <Popover shadow="sm" position="bottom-end" offset={5}>
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
          <Box px="md" py="sm">
            <Switch
              size="sm"
              checked={dashboard.width === "full"}
              onChange={handleToggleWidth}
              label={t`Full width`}
            />
          </Box>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
