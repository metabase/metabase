import { type JSX, type MouseEvent, useState } from "react";
import { withRouter } from "react-router";
import type { WithRouterProps } from "react-router/lib/withRouter";
import { c, t } from "ttag";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import type { HeaderButtonProps } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types";
import { useRefreshDashboard } from "metabase/dashboard/hooks";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";

const DashboardActionMenuInner = ({
  canResetFilters,
  onResetFilters,
  onFullscreenChange,
  isFullscreen,
  dashboard,
  canEdit,
  location,
  openSettingsSidebar,
}: HeaderButtonProps & WithRouterProps): JSX.Element => {
  const [opened, setOpened] = useState(false);

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId: dashboard.id,
    parameterQueryParams: location.query,
    refetchData: false,
  });

  const moderationItems = PLUGIN_MODERATION.useDashboardMenuItems(
    dashboard,
    refreshDashboard,
  );

  return (
    <Menu position="bottom-end" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <div>
          <Tooltip tooltip={t`Move, trash, and more…`} isEnabled={!opened}>
            <Button
              onlyIcon
              icon="ellipsis"
              aria-label={t`Move, trash, and more…`}
            />
          </Tooltip>
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        {canResetFilters && (
          <Menu.Item icon={<Icon name="revert" />} onClick={onResetFilters}>
            {t`Reset all filters`}
          </Menu.Item>
        )}

        <Menu.Item
          icon={<Icon name="expand" />}
          onClick={(e: MouseEvent) =>
            onFullscreenChange(!isFullscreen, !e.altKey)
          }
        >
          {t`Enter fullscreen`}
        </Menu.Item>

        {canEdit && (
          <>
            <Menu.Item
              icon={<Icon name="gear" />}
              onClick={openSettingsSidebar}
            >
              {t`Edit settings`}
            </Menu.Item>

            {moderationItems}
          </>
        )}

        {canEdit && (
          <>
            <Menu.Divider />

            <Menu.Item
              icon={<Icon name="move" />}
              component="a"
              href={`${location?.pathname}/move`}
            >{c("A verb, not a noun").t`Move`}</Menu.Item>
          </>
        )}

        <Menu.Item
          icon={<Icon name="clone" />}
          component="a"
          href={`${location?.pathname}/copy`}
        >{c("A verb, not a noun").t`Duplicate`}</Menu.Item>

        {canEdit && (
          <>
            <Menu.Divider />
            <Menu.Item
              icon={<Icon name="trash" />}
              component="a"
              href={`${location?.pathname}/archive`}
            >{t`Move to trash`}</Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

export const DashboardActionMenu = withRouter(DashboardActionMenuInner);
