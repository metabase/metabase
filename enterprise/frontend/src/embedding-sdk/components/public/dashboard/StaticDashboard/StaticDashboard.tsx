import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type StaticDashboardProps = SdkDashboardProps;

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const StaticDashboard = (props: StaticDashboardProps) => {
  return <SdkDashboard {...props} mode="static" />;
};
