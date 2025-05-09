import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { setDashboardAttributes } from "metabase/dashboard/actions";
import { trackDashboardWidthChange } from "metabase/dashboard/analytics";
import { getDashboard, getDashboardId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Popover, Stack, Switch } from "metabase/ui";

// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const EXTRA_BUTTONS_DESCRIPTION = t`Toggle width`;

export function ExtraEditButtonsMenu() {
  const dispatch = useDispatch();
  const id = useSelector(getDashboardId);
  const dashboard = useSelector(getDashboard);
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
          <ToolbarButton
            tooltipLabel={EXTRA_BUTTONS_DESCRIPTION}
            aria-label={EXTRA_BUTTONS_DESCRIPTION}
            icon="ellipsis"
          />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack>
          <Box px="md" py="sm">
            <Switch
              size="sm"
              checked={dashboard?.width === "full"}
              onChange={handleToggleWidth}
              label={t`Full width`}
            />
          </Box>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
