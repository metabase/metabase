import { Flex } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { LibraryDashboardDescriptionSection } from "../components/LibraryDashboardDescriptionSection";
import S from "../components/LibraryDashboardOverview.module.css";
import { LibraryDashboardPage } from "../components/LibraryDashboardPage";
import { LibraryDashboardPreview } from "../components/LibraryDashboardPreview";
import { ResizableSidePanel } from "../components/ResizableSidePanel";

const MIN_HEIGHT = 480;
// with the page's 2rem bottom padding, leaves 56px below the card
const BOTTOM_MARGIN = "1.5rem";

export function LibraryDashboardOverviewPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-overview-page">
      {(dashboard) => <LibraryDashboardOverview dashboard={dashboard} />}
    </LibraryDashboardPage>
  );
}

function LibraryDashboardOverview({ dashboard }: { dashboard: Dashboard }) {
  return (
    <Flex flex={1} gap={0} mih={MIN_HEIGHT} mb={BOTTOM_MARGIN}>
      <LibraryDashboardPreview
        dashboardId={dashboard.id}
        className={S.preview}
      />
      <ResizableSidePanel>
        <LibraryDashboardDescriptionSection dashboard={dashboard} />
      </ResizableSidePanel>
    </Flex>
  );
}
