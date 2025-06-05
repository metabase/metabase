import { useDashboardContext } from "metabase/dashboard/context";
import { getVisibleParameters } from "metabase/parameters/utils/ui";

import { ExportAsPdfButton } from "../buttons/ExportAsPdfButton";

export function ExportDashboardAsPdf() {
  const { dashboard, downloadsEnabled, titled, parameters, hideParameters } =
    useDashboardContext();
  const hasParameters = Array.isArray(parameters) && parameters.length > 0;
  const visibleParameters = hasParameters
    ? getVisibleParameters(parameters, hideParameters)
    : [];
  const hasVisibleParameters = visibleParameters.length > 0;

  return (
    dashboard &&
    downloadsEnabled.pdf && (
      <ExportAsPdfButton
        dashboard={dashboard}
        hasTitle={titled}
        hasVisibleParameters={hasVisibleParameters}
      />
    )
  );
}
