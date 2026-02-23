import { type MouseEvent, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { useRefreshDashboard } from "metabase/dashboard/hooks";
import { getIsSharing as getIsDashboardSubscriptionSidebarOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DashboardSubscriptionMenuItem } from "metabase/notifications/NotificationsActionsMenu/DashboardSubscriptionMenuItem";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";

type DashboardActionMenuProps = {
  canResetFilters: boolean;
  onResetFilters: () => void;
  canEdit: boolean;
  openSettingsSidebar: () => void;
};

const searchParamsToQuery = (
  searchParams: URLSearchParams,
): Record<string, string> => {
  const result: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

export const DashboardActionMenu = ({
  canResetFilters,
  onResetFilters,
  canEdit,
  openSettingsSidebar,
}: DashboardActionMenuProps) => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const parameterQueryParams = searchParamsToQuery(searchParams);
  const { dashboard, isFullscreen, onFullscreenChange, onChangeLocation } =
    useDashboardContext();
  const [opened, setOpened] = useState(false);
  const dispatch = useDispatch();

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId: dashboard?.id ?? null,
    parameterQueryParams,
  });

  const moderationItems = PLUGIN_MODERATION.useDashboardMenuItems(
    dashboard ?? undefined,
    refreshDashboard,
  );

  const isDashboardSubscriptionSidebarOpen = useSelector(
    getIsDashboardSubscriptionSidebarOpen,
  );

  const toggleSubscriptionSidebar = () =>
    dispatch(
      setDashboardSubscriptionSidebarOpen(!isDashboardSubscriptionSidebarOpen),
    );

  // solely for the dependency list below, so we don't ever have an undefined
  const pathname = location.pathname ?? "";
  useRegisterShortcut(
    [
      {
        id: "dashboard-send-to-trash",
        perform: () => {
          if (pathname) {
            onChangeLocation(`${pathname}/archive`);
          }
        },
      },
    ],
    [pathname],
  );

  if (!dashboard) {
    return null;
  }

  return (
    <Menu position="bottom-end" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <div>
          <ToolbarButton
            icon="ellipsis"
            aria-label={t`Move, trash, and more…`}
            tooltipLabel={t`Move, trash, and more…`}
          />
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        {canResetFilters && (
          <Menu.Item
            leftSection={<Icon name="revert" />}
            onClick={onResetFilters}
          >
            {t`Reset all filters`}
          </Menu.Item>
        )}

        <DashboardSubscriptionMenuItem
          dashboard={dashboard}
          onClick={toggleSubscriptionSidebar}
        />

        <Menu.Item
          leftSection={<Icon name="expand" />}
          onClick={(e: MouseEvent) =>
            onFullscreenChange(!isFullscreen, !e.altKey)
          }
        >
          {t`Enter fullscreen`}
        </Menu.Item>

        {canEdit && (
          <>
            <Menu.Item
              leftSection={<Icon name="gear" />}
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
              leftSection={<Icon name="move" />}
              component={ForwardRefLink}
              to={`${location.pathname}/move`}
            >{c("A verb, not a noun").t`Move`}</Menu.Item>
          </>
        )}

        <Menu.Item
          leftSection={<Icon name="clone" />}
          component={ForwardRefLink}
          to={`${location.pathname}/copy`}
        >{c("A verb, not a noun").t`Duplicate`}</Menu.Item>

        {canEdit && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="trash" />}
              component={ForwardRefLink}
              to={`${location.pathname}/archive`}
            >{t`Move to trash`}</Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};
