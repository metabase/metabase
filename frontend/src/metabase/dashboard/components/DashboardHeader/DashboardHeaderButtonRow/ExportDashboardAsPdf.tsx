import { useDashboardContext } from "metabase/dashboard/context";

import { ExportAsPdfButton } from "../buttons/ExportAsPdfButton";

export function ExportDashboardAsPdf() {
  const { dashboard, downloadsEnabled } = useDashboardContext();

  return (
    dashboard &&
    downloadsEnabled.pdf && <ExportAsPdfButton dashboard={dashboard} />
  );
}
