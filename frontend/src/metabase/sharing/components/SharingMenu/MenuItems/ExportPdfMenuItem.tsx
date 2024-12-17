import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { isWithinIframe } from "metabase/lib/dom";
import { Icon, Menu } from "metabase/ui";
import {
  getExportTabAsPdfButtonText,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

const handleClick = async (dashboard: Dashboard) => {
  const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
  await saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
    trackExportDashboardToPDF({
      dashboardId: dashboard.id,
      dashboardAccessedVia: isWithinIframe()
        ? "interactive-iframe-embed"
        : "internal",
    });
  });
};

export const ExportPdfMenuItem = ({ dashboard }: { dashboard: Dashboard }) => {
  return (
    <Menu.Item
      data-testid="dashboard-export-pdf-button"
      icon={<Icon name="document" />}
      onClick={() => handleClick(dashboard)}
    >
      {getExportTabAsPdfButtonText(dashboard.tabs)}
    </Menu.Item>
  );
};
