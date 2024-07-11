import type { MouseEvent } from "react";
import { t } from "ttag";

import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import {
  type OverflowMenuItem,
  OverflowMenu,
} from "metabase/dashboard/components/DashboardHeader/buttons/OverflowMenu";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import type { DashboardFullscreenControls } from "metabase/dashboard/types";
import { PLUGIN_DASHBOARD_HEADER } from "metabase/plugins";
import { Box } from "metabase/ui";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

type DashboardActionMenuProps = {
  items: OverflowMenuItem[];
};

export const DashboardActionMenu = ({ items }: DashboardActionMenuProps) => (
  <OverflowMenu
    items={items}
    target={
      <Box>
        <EntityMenuTrigger
          ariaLabel={t`Move, trash, and more...`}
          icon="ellipsis"
          tooltip={t`Move, trash, and more...`}
        />
      </Box>
    }
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
}): OverflowMenuItem[] => [
  {
    title: t`Enter fullscreen`,
    icon: "expand",
    action: (e: MouseEvent) => onFullscreenChange(!isFullscreen, !e.altKey),
    event: `Dashboard;Fullscreen Mode;${!isFullscreen}`,
  },
  {
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
  },
  {
    enabled: canEdit,
    title: t`Move`,
    icon: "move",
    link: `${pathname}/move`,
    event: "Dashboard;Move",
  },
  {
    title: t`Duplicate`,
    icon: "clone",
    link: `${pathname}/copy`,
    event: "Dashboard;Copy",
  },
  {
    enabled: canEdit,
    ...PLUGIN_DASHBOARD_HEADER.extraButtons(dashboard),
  },
  {
    enabled: canEdit,
    title: t`Move to trash`,
    icon: "trash",
    link: `${pathname}/archive`,
    event: "Dashboard;Archive",
  },
];
