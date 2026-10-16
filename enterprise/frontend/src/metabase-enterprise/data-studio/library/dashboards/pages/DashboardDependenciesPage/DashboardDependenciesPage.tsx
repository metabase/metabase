import { LibraryItemDependencies } from "../../../components/LibraryItemDependencies";
import { DashboardPageShell } from "../../components/DashboardPageShell";

export function DashboardDependenciesPage() {
  return (
    <DashboardPageShell data-testid="dashboard-dependencies-page">
      {(dashboard) => (
        <LibraryItemDependencies model="dashboard" item={dashboard} />
      )}
    </DashboardPageShell>
  );
}
