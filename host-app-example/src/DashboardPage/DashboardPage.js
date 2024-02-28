import { PublicDashboard } from "metabase-embedding-sdk";
import { ErrorBoundary } from "react-error-boundary";

export const DashboardPage = () => {
  return (
    <ErrorBoundary fallback={<div>something went wrong</div>}>
      <PublicDashboard uuid="a8c6088d-13eb-48eb-ab43-65d6e3a00928" />
    </ErrorBoundary>
  );
};
