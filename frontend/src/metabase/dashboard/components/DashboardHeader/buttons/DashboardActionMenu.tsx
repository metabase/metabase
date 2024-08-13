import type { MouseEvent } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { isWithinIframe } from "metabase/lib/dom";
import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import {
  getExportTabAsPdfButtonText,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";
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
}: DashboardFullscreenControls & {
  canResetFilters: boolean;
  onResetFilters: () => void;
  dashboard: Dashboard;
  canEdit: boolean;
  pathname: string;
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
    event: `Dashboard;Fullscreen Mode;${!isFullscreen}`,
  });

  extraButtons.push({
    title: getExportTabAsPdfButtonText(dashboard.tabs),
    icon: "document",
    testId: "dashboard-export-pdf-button",
    action: async () => {
      const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
      await saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
        trackExportDashboardToPDF({
          dashboardId: dashboard.id,
          dashboardAccessedVia: isWithinIframe()
            ? "interactive-iframe-embed"
            : "internal",
        });
      });
    },
  });

  if (canEdit) {
    extraButtons.push({
      title: t`Move`,
      icon: "move",
      link: `${pathname}/move`,
      event: "Dashboard;Move",
    });
  }

  extraButtons.push({
    title: t`Duplicate`,
    icon: "clone",
    link: `${pathname}/copy`,
    event: "Dashboard;Copy",
  });

  if (canEdit) {
    extraButtons.push(...PLUGIN_DASHBOARD_HEADER.extraButtons(dashboard));

    extraButtons.push({
      title: t`Move to trash`,
      icon: "trash",
      link: `${pathname}/archive`,
      event: "Dashboard;Archive",
    });
  }

  return extraButtons;
};
