import type { MouseEvent } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

export const DashboardActionMenu = (props: { items: any[] }) => (
  <EntityMenu
    key="dashboard-action-menu-button"
    triggerAriaLabel="dashboard-menu-button"
    items={props.items}
    triggerIcon="ellipsis"
    tooltip={t`Move, trash, and more...`}
    // TODO: Try to restore this transition once we upgrade to React 18 and can prioritize this update
    transitionDuration={0}
  />
);

export const getExtraButtons = ({
  onFullscreenChange,
  isFullscreen,
  dashboard,
  canEdit,
  pathname,
}: DashboardFullscreenControls & {
  dashboard: Dashboard;
  canEdit: boolean;
  pathname: string;
}) => {
  const extraButtons = [];

  extraButtons.push({
    title: t`Enter fullscreen`,
    icon: "expand",
    action: (e: MouseEvent) => onFullscreenChange(!isFullscreen, !e.altKey),
    event: `Dashboard;Fullscreen Mode;${!isFullscreen}`,
  });

  extraButtons.push({
    title:
      Array.isArray(dashboard.tabs) && dashboard.tabs.length > 1
        ? t`Export tab as PDF`
        : t`Export as PDF`,
    icon: "document",
    testId: "dashboard-export-pdf-button",
    action: async () => {
      const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
      await saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
        trackExportDashboardToPDF(dashboard.id);
      });
    },
  });

  extraButtons.push({
    title: "Экспортировать для печати",
    icon: "folder",
    link: `${pathname}/export-pdf`,
    event: "Dashboard;ExportPDF",
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
