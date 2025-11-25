import type { ButtonHTMLAttributes } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useHasTokenFeature } from "metabase/common/hooks";
import {
  type DashboardAccessedVia,
  trackExportDashboardToPDF,
} from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import type { ActionIconProps } from "metabase/ui";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";

export const ExportAsPdfButton = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
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
    <ToolbarButton
      icon="download"
      onClick={saveAsPDF}
      tooltipLabel={t`Download as PDF`}
      data-testid="export-as-pdf-button"
      {...props}
    />
  );
};
