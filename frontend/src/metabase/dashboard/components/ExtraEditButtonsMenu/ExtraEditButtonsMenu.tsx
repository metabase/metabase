import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { setDashboardAttributes } from "metabase/dashboard/actions";
import { trackDashboardWidthChange } from "metabase/dashboard/analytics";
import { getDashboard, getDashboardId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Popover, Stack, Switch } from "metabase/ui";

const getExtraButtonsDescription = () => t`Toggle width`;

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
            tooltipLabel={getExtraButtonsDescription()}
            aria-label={getExtraButtonsDescription()}
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
