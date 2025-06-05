import type { PropsWithChildren } from "react";

import { renderOnlyInSdkProvider } from "embedding-sdk/components/private/SdkContext";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type InteractiveDashboardProps = SdkDashboardProps;

const InteractiveDashboardInner = ({
  drillThroughQuestionProps,
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
      }}
    />
  );
};

/**
 * A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.
 *
 * @function
 * @category InteractiveDashboard
 */
export const InteractiveDashboard = renderOnlyInSdkProvider(
  InteractiveDashboardInner,
);
