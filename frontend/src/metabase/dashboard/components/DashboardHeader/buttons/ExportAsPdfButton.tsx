import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import { downloadDashboardToPdf } from "metabase/redux/downloads";
import type { ActionIconProps } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";

export const ExportAsPdfButton = (
  props: ActionIconProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { dashboard } = useDashboardContext();
  const dispatch = useDispatch();

  const saveAsPDF = () => {
    dispatch(
      downloadDashboardToPdf({
        dashboard: checkNotNull(dashboard),
        id: Date.now(),
      }),
    );
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
