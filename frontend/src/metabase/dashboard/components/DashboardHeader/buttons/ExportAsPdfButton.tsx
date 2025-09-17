import { match } from "ts-pattern";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import {
  type DashboardAccessedVia,
  trackExportDashboardToPDF,
} from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";

export const ExportAsPdfButton = (props: ActionIconProps) => {
  const { dashboard } = useDashboardContext();
  const isWhitelabeled = useHasTokenFeature("whitelabel");
  const includeBranding = !isWhitelabeled;

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
    return saveDashboardPdf({
      selector: cardNodeSelector,
      dashboardName: dashboard?.name ?? t`Exported dashboard`,
      includeBranding,
    });
  };

  return (
    <Tooltip label={t`Download as PDF`}>
      <ActionIcon
        onClick={saveAsPDF}
        aria-label={t`Download as PDF`}
        data-testid="export-as-pdf-button"
        {...props}
      >
        <Icon name="download" />
      </ActionIcon>
    </Tooltip>
  );
};
