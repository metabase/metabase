import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type EditableDashboardProps = SdkDashboardProps;

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const EditableDashboard = (props: EditableDashboardProps) => {
  return <SdkDashboard {...props} mode="editable" />;
};
