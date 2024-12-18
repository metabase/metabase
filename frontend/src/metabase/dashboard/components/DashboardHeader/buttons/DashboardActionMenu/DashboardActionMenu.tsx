import { type JSX, type MouseEvent, useState } from "react";
import { withRouter } from "react-router";
import type { WithRouterProps } from "react-router/lib/withRouter";
import { c, t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { EmbeddingModals } from "metabase/dashboard/components/DashboardHeader/EmbeddingModals";
import type { DashboardSharingModalType } from "metabase/dashboard/components/DashboardHeader/types";
import { useRefreshDashboard } from "metabase/dashboard/hooks";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { EmbedMenuItem } from "metabase/sharing/components/EmbedMenuItem";
import { ExportPdfMenuItem } from "metabase/sharing/components/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "metabase/sharing/components/PublicLinkMenuItem";
import { Icon, Menu } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

type DashboardActionMenuProps = {
  canResetFilters: boolean;
  onResetFilters: () => void;
  canEdit: boolean;
  dashboard: Dashboard;
  openSettingsSidebar: () => void;
};

const DashboardActionMenuInner = ({
  canResetFilters,
  onResetFilters,
  onFullscreenChange,
  isFullscreen,
  dashboard,
  canEdit,
  location,
  openSettingsSidebar,
}: DashboardActionMenuProps &
  DashboardFullscreenControls &
  WithRouterProps): JSX.Element => {
  const [opened, setOpened] = useState(false);

  const [modalType, setModalType] = useState<DashboardSharingModalType | null>(
    null,
  );

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId: dashboard.id,
    parameterQueryParams: location.query,
    refetchData: false,
  });

  const moderationItems = PLUGIN_MODERATION.useDashboardMenuItems(
    dashboard,
    refreshDashboard,
  );

  const hasPublicLink = !!dashboard?.public_uuid;
  const isArchived = dashboard.archived;
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);

  const canShare = !isArchived && !isAnalytics;

  return (
    <>
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

          <ExportPdfMenuItem dashboard={dashboard} />

          {canShare && (
            <>
              <Menu.Divider />
              <PublicLinkMenuItem
                hasPublicLink={hasPublicLink}
                onClick={() => setModalType("dashboard-public-link")}
              />
              <EmbedMenuItem onClick={() => setModalType("dashboard-embed")} />
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
      <EmbeddingModals
        modalType={modalType}
        dashboard={dashboard}
        onClose={() => setModalType(null)}
      />
    </>
  );
};

export const DashboardActionMenu = withRouter(DashboardActionMenuInner);
