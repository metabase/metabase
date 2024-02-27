import { PublicDashboard } from "metabase-embedding-sdk";
import { ErrorBoundary } from "react-error-boundary";

export const DashboardPage = () => {
  return (
    <div>
      <ErrorBoundary fallback={<div>something went wrong</div>}>
        <PublicDashboard uuid="c364ca2f-0197-4bda-ac1e-cdde488ef621" />
      </ErrorBoundary>
    </div>
  );
};
