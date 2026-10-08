import { DashboardUsageStats } from "../components/DashboardUsageStats";
import S from "../components/LibraryDashboardOverview.module.css";
import { LibraryDashboardPage } from "../components/LibraryDashboardPage";

export function LibraryDashboardUsageStatsPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-usage-stats-page">
      {(dashboard) => (
        <DashboardUsageStats
          dashboardId={dashboard.id}
          className={S.usageStats}
        />
      )}
    </LibraryDashboardPage>
  );
}
