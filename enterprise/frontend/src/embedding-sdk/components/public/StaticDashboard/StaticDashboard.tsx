import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

export type StaticDashboardProps = SdkDashboardProps;
export const StaticDashboard = ({
  plugins,
  ...sdkDashboardProps
}: SdkDashboardProps) => (
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
