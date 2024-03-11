import { PublicDashboard } from "metabase-embedding-sdk";
import { ErrorBoundary } from "react-error-boundary";
import { DashboardOptionToggleSection } from "../DashboardOptionToggleSection/DashboardOptionToggleSection";
import { useState } from "react";

export const DashboardPage = () => {
  const [options, setOptions] = useState({
    theme: "light",
    titled: false,
  });

  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  const dashboardId = "a0104c5d-fff3-42c5-a039-b74645c760fe";

  return (
    <ErrorBoundary fallback={<div>something went wrong</div>}>
      <div className="tw-bg-gray-800">
        <DashboardOptionToggleSection
          dashboardId={dashboardId}
          currentOptions={options}
          setOptions={newValue =>
            setOptions({
              ...options,
              ...newValue,
            })
          }
        />
        <div className={
            isDashboardLoading ? "tw-hidden" : "tw-p-12 tw-z-0"
        }>
          <PublicDashboard
            uuid={dashboardId}
            embedOptions={options}
            events={{
              onDashboardLoad: dashboard => {
                setIsDashboardLoading(false);
              },
            }}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
};
