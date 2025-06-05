import type { PropsWithChildren } from "react";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = SdkDashboardProps;

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = ({
  drillThroughQuestionProps,
  plugins,
  ...sdkDashboardProps
}: PropsWithChildren<SdkDashboardProps> &
  Pick<SdkDashboardProps, "drillThroughQuestionProps">) => {
  return (
    <SdkDashboard
      {...sdkDashboardProps}
      plugins={{
        dashboard: {
          dashboardCardMenu: {
            withDownloads: sdkDashboardProps.withDownloads,
            withEditLink: false,
          },
        },
        ...plugins,
      }}
      mode="interactive"
    />
  );
};
