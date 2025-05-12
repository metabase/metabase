import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */

export const EditableDashboard = (props: SdkDashboardProps) => (
  <SdkDashboard mode="editable" {...props} />
);
