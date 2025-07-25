import { useHasTokenFeature } from "metabase/common/hooks";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { isWithinIframe } from "metabase/lib/dom";
import { Icon, Menu } from "metabase/ui";
import {
  getExportTabAsPdfButtonText,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

const handleClick = async (dashboard: Dashboard, includeBranding: boolean) => {
  const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
  await saveDashboardPdf({
    selector: cardNodeSelector,
    dashboardName: dashboard.name,
    includeBranding,
  }).then(() => {
    trackExportDashboardToPDF({
      dashboardId: dashboard.id,
      dashboardAccessedVia: isWithinIframe()
        ? "interactive-iframe-embed"
        : "internal",
    });
  });
};

export const ExportPdfMenuItem = ({ dashboard }: { dashboard: Dashboard }) => {
  const isWhitelabeled = useHasTokenFeature("whitelabel");
  const includeBranding = !isWhitelabeled;

  return (
    <Menu.Item
      data-testid="dashboard-export-pdf-button"
      leftSection={<Icon name="document" />}
      onClick={() => handleClick(dashboard, includeBranding)}
    >
      {getExportTabAsPdfButtonText(dashboard.tabs)}
    </Menu.Item>
  );
};
