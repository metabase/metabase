import { SDK_DASHBOARD_VIEW_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type EditableDashboardProps = SdkDashboardProps;

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const EditableDashboard = ({
  plugins,
  ...sdkDashboardProps
}: EditableDashboardProps) => {
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
