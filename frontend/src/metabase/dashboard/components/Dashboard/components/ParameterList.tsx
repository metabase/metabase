import { useDashboardContext } from "metabase/dashboard/context";

import { DashboardParameterPanel } from "../../DashboardParameterPanel";

export const ParameterList = () => {
  const { isFullscreen } = useDashboardContext();

  return <DashboardParameterPanel isFullscreen={isFullscreen} />;
};
