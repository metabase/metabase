import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { Box, Icon, Menu } from "metabase/ui";

import { AUTO_REFRESH_OPTIONS } from "./options";

type AutoRefreshMenuItemProps = {
  onClick: () => void;
};

/**
 * Trigger row shown in the dashboard overflow menu. Clicking it drills into the
 * auto-refresh options (see {@link AutoRefreshMenuOptions}) instead of flying
 * out a submenu on hover.
 */
export const AutoRefreshMenuItem = ({ onClick }: AutoRefreshMenuItemProps) => (
  <Menu.Item
    leftSection={<Icon name="clock" />}
    rightSection={<Icon name="chevronright" />}
    closeMenuOnClick={false}
    onClick={onClick}
    data-testid="dashboard-auto-refresh-menu-item"
  >
    {t`Auto-refresh`}
  </Menu.Item>
);

type AutoRefreshMenuOptionsProps = {
  onSelect: () => void;
};

/**
 * The list of auto-refresh intervals that replaces the overflow menu content
 * once the {@link AutoRefreshMenuItem} trigger is clicked. Mirrors the popover
 * shown when clicking the auto-refresh countdown indicator.
 */
export const AutoRefreshMenuOptions = ({
  onSelect,
}: AutoRefreshMenuOptionsProps) => {
  const { refreshPeriod, onRefreshPeriodChange } = useDashboardContext();

  return (
    <>
      <Box
        fw="bold"
        fz="sm"
        tt="uppercase"
        mb="md"
        ml="sm"
        c="text-secondary"
      >{t`Auto Refresh`}</Box>
      {AUTO_REFRESH_OPTIONS.map((option) => (
        <Menu.Item
          key={String(option.period)}
          leftSection={
            <Icon
              name="check"
              style={{
                visibility:
                  option.period === refreshPeriod ? "visible" : "hidden",
              }}
            />
          }
          onClick={() => {
            onRefreshPeriodChange(option.period);
            onSelect();
          }}
        >
          {option.name}
        </Menu.Item>
      ))}
    </>
  );
};
