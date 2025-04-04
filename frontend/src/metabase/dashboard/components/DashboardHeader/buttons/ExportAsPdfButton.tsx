import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type DashboardAccessedVia,
  trackExportDashboardToPDF,
} from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { Button, Icon } from "metabase/ui";
import {
  getExportTabAsPdfButtonText,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";

export const ExportAsPdfButton = ({ color }: { color?: string }) => {
  const { dashboard } = useDashboardContext();

  const saveAsPDF = () => {
    const dashboardAccessedVia = match(dashboard?.id)
      .returnType<DashboardAccessedVia>()
      .when(isJWT, () => "static-embed")
      .when(isUuid, () => "public-link")
      .otherwise(() => "sdk-embed");

    trackExportDashboardToPDF({
      dashboardAccessedVia,
    });

    const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
    return saveDashboardPdf(
      cardNodeSelector,
      dashboard.name ?? t`Exported dashboard`,
    );
  };

  return (
    <Button
      variant="subtle"
      px="0.5rem"
      leftSection={<Icon name="document" />}
      color={color || "text-dark"}
      onClick={saveAsPDF}
    >
      {getExportTabAsPdfButtonText(dashboard.tabs)}
    </Button>
  );
};
