import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type InteractiveDashboardProps = SdkDashboardProps;

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const InteractiveDashboard = (props: InteractiveDashboardProps) => {
  return <SdkDashboard {...props} mode="interactive" />;
};
