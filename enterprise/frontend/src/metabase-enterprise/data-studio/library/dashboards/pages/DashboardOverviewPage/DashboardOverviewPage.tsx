import { OverviewLayout } from "../../../components/OverviewLayout";
import { DashboardPageShell } from "../../components/DashboardPageShell";

import { DashboardInfo } from "./DashboardInfo";
import { DashboardPreview } from "./DashboardPreview";

export function DashboardOverviewPage() {
  return (
    <DashboardPageShell data-testid="dashboard-overview-page">
      {(dashboard) => (
        <OverviewLayout
          preview={<DashboardPreview dashboard={dashboard} />}
          info={<DashboardInfo dashboard={dashboard} />}
        />
      )}
    </DashboardPageShell>
  );
}
