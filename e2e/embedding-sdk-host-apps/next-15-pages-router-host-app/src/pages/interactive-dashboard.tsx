import { InteractiveDashboard } from "@metabase/embedding-sdk-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const defaultDashboardId = 1;

export default function InteractiveDashboardPage() {
  const searchParams = useSearchParams();

  const dashboardId = useMemo(() => {
    const dashboardIdFromQuery = searchParams.get("dashboardId");
    return dashboardIdFromQuery
      ? parseInt(dashboardIdFromQuery)
      : defaultDashboardId;
  }, [searchParams]);

  return (
    <main style={{ padding: "1rem" }}>
      <h1 style={{ marginBottom: "4rem" }}>Interactive Dashboard Example</h1>
      <InteractiveDashboard dashboardId={dashboardId} withDownloads />
    </main>
  );
}
