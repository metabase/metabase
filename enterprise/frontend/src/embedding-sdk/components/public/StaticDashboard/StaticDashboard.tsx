import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

export type StaticDashboardProps = SdkDashboardProps;
export const StaticDashboard = ({
  drillThroughQuestionProps,
  plugins,
  ...sdkDashboardProps
}: SdkDashboardProps) => {
  return (
    <SdkDashboard
      {...sdkDashboardProps}
      dashboardActions={[]}
      plugins={{
        dashboard: {
          dashboardCardMenu: {
            withDownloads: sdkDashboardProps.withDownloads,
            withEditLink: false,
          },
        },
        ...plugins,
      }}
      mode="static"
    />
  );
};
