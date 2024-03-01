import {
  PublicDashboard,
} from "metabase-embedding-sdk";
import { ErrorBoundary } from "react-error-boundary";
import { DashboardOptionToggleSection } from "../DashboardOptionToggleSection/DashboardOptionToggleSection";
import { useState } from "react";

export const DashboardPage = () => {

  const [options, setOptions] = useState({
    theme: "light",
    titled: false,
  });

  const dashboardId = "f8c9e612-def0-4e8e-9cfc-a81653e40b5e";

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
        <div className="tw-p-12 tw-z-0">
          <PublicDashboard
            uuid={dashboardId}
            embedOptions={options}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
};
