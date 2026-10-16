import { LibrarySectionPage } from "../../../components/LibrarySectionPage";
import { CreateLibraryDashboardModal } from "../../components/CreateLibraryDashboardModal";

export function DashboardsPage() {
  return (
    <LibrarySectionPage
      model="dashboard"
      CreateModal={CreateLibraryDashboardModal}
    />
  );
}
