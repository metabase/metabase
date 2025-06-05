import { SDK_DASHBOARD_VIEW_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type EditableDashboardProps = SdkDashboardProps;

export const EditableDashboard = ({
  drillThroughQuestionProps,
  plugins,
  ...sdkDashboardProps
}: SdkDashboardProps) => {
  const dashboardActions = SDK_DASHBOARD_VIEW_ACTIONS;

  return (
    <SdkDashboard
      {...sdkDashboardProps}
      dashboardActions={dashboardActions}
      plugins={plugins}
      mode="editable"
    />
  );
};
