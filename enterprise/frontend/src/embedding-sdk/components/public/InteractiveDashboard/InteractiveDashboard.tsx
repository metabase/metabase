import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";
/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = (props: SdkDashboardProps) => (
  <SdkDashboard mode="interactive" {...props} />
);
