import type { MouseEvent, ReactNode } from "react";
import { t } from "ttag";

import { MaybeLink } from "metabase/components/Badge/Badge.styled";
import { ToolbarButton } from "metabase/components/ToolbarButton";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import { Group, Icon, type IconName, Menu, Text, Tooltip } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import Styles from "./DashboardActionMenu.module.css";

export const DashboardActionMenu = ({
  items,
}: {
  items: DashboardHeaderActionMenuItem[];
}) => {
  const tooltipLabel = t`Move, trash, and more…`;
  return (
    <Menu trigger="click" closeDelay={200} key="dashboard-action-menu-button">
      <Menu.Target>
        <Tooltip label={tooltipLabel}>
          <ToolbarButton
            aria-label={tooltipLabel}
            className={Styles.DashboardMenuTriggerToolbarButton}
          >
            <Icon name="ellipsis" className={Styles.DashboardMenuTriggerIcon} />
          </ToolbarButton>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map(
          item =>
            item.component ?? (
              // The em padding and spacing here makes it match our legacy menus
              <Menu.Item
                p="0.85em 1.45em"
                onClick={item.action}
                key={item.key || item.title}
                className={Styles.DashboardActionMenuItem}
              >
                <MaybeLink to={item.link}>
                  <Group noWrap h="18px" spacing=".65em">
                    {item.icon && (
                      <Icon
                        height="1rem"
                        style={{ flexShrink: 0 }}
                        name={item.icon}
                      />
                    )}
                    <Text
                      lh="1rem"
                      className={Styles.DashboardActionMenuItemText}
                    >
                      {item.title}
                    </Text>
                  </Group>
                </MaybeLink>
              </Menu.Item>
            ),
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

export type DashboardHeaderActionMenuItem = {
  key?: string;
  title?: string;
  component?: ReactNode;
  icon?: IconName;
  separator?: boolean;
  action?: (e: MouseEvent) => void;
  link?: string;
};

export const getExtraButtons = ({
  canResetFilters,
  onResetFilters,
  onFullscreenChange,
  isFullscreen,
  dashboard,
  canEdit,
  pathname,
  openSettingsSidebar,
}: DashboardFullscreenControls & {
  canResetFilters: boolean;
  onResetFilters: () => void;
  dashboard: Dashboard;
  canEdit: boolean;
  pathname: string;
  openSettingsSidebar: () => void;
}): DashboardHeaderActionMenuItem[] => {
  const extraButtons: DashboardHeaderActionMenuItem[] = [];

  if (canResetFilters) {
    extraButtons.push({
      title: t`Reset all filters`,
      icon: "revert",
      action: () => onResetFilters(),
    });
  }

  extraButtons.push({
    title: t`Enter fullscreen`,
    icon: "expand",
    action: (e: MouseEvent) => onFullscreenChange(!isFullscreen, !e.altKey),
  });

  extraButtons.push({
    title: t`Edit settings`,
    icon: "gear",
    action: openSettingsSidebar,
    separator: true,
  });

  if (canEdit) {
    extraButtons.push({
      title: t`Move`,
      icon: "move",
      link: `${pathname}/move`,
    });
  }

  extraButtons.push({
    title: t`Duplicate`,
    icon: "clone",
    link: `${pathname}/copy`,
    separator: true,
  });

  if (canEdit) {
    extraButtons.push(...PLUGIN_DASHBOARD_HEADER.extraButtons(dashboard));

    extraButtons.push({
      title: t`Move to trash`,
      icon: "trash",
      link: `${pathname}/archive`,
    });
  }

  return extraButtons;
};
