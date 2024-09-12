import type { MouseEvent } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import type { Dashboard } from "metabase-types/api";

export const DashboardActionMenu = (props: { items: any[] }) => (
  <EntityMenu
    key="dashboard-action-menu-button"
    triggerAriaLabel={t`Move, trash, and more…`}
    items={props.items}
    triggerIcon="ellipsis"
    tooltip={t`Move, trash, and more…`}
    // TODO: Try to restore this transition once we upgrade to React 18 and can prioritize this update
    transitionDuration={0}
  />
);

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
}) => {
  const extraButtons = [];

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
  });

  extraButtons.push({
    separator: true,
    key: "separator-after-edit-settings",
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
  });

  if (canEdit) {
    extraButtons.push({
      separator: true,
      key: "separator-before-ee-buttons-and-trash",
    });

    extraButtons.push(...PLUGIN_DASHBOARD_HEADER.extraButtons(dashboard));

    extraButtons.push({
      title: t`Move to trash`,
      icon: "trash",
      link: `${pathname}/archive`,
    });
  }

  return extraButtons;
};
