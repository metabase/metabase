import { t } from "ttag";

import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { useDispatch } from "metabase/lib/redux";
import { Button, Icon } from "metabase/ui";
import {
  getExportTabAsPdfButtonText,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

export const ExportAsPdfButton = ({ dashboard }: { dashboard: Dashboard }) => {
  const dispatch = useDispatch();

  const saveAsPDF = async () => {
    const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
    await saveDashboardPdf(
      cardNodeSelector,
      dashboard.name ?? t`Exported dashboard`,
    ).then(() => {
      // TODO: tracking
      // trackExportDashboardToPDF(dashboard.id);
    });
  };

  return (
    <Button
      variant="subtle"
      leftIcon={<Icon name="document" />}
      color="text-dark"
      onClick={() => dispatch(saveAsPDF)}
    >
      {getExportTabAsPdfButtonText(dashboard.tabs)}
    </Button>
  );
};
