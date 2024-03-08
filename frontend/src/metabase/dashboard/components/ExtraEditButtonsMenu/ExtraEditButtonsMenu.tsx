import { t } from "ttag";

import { setDashboardAttributes } from "metabase/dashboard/actions";
import { trackDashboardWidthChange } from "metabase/dashboard/analytics";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { getDashboardId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Icon, Popover, Stack, Switch, Tooltip } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

const EXTRA_BUTTONS_DESCRIPTION = t`Toggle width`;

interface ExtraEditButtonsMenuProps {
  dashboard: Dashboard;
}

export function ExtraEditButtonsMenu({ dashboard }: ExtraEditButtonsMenuProps) {
  const dispatch = useDispatch();
  const id = useSelector(getDashboardId);

  const handleToggleWidth = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextWidth = event.currentTarget.checked ? "full" : "fixed";

    if (id) {
      dispatch(
        setDashboardAttributes({ id, attributes: { width: nextWidth } }),
      );
      trackDashboardWidthChange(id, nextWidth);
    }
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
