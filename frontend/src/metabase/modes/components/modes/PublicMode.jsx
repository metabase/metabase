import DashboardClickDrill from "metabase/modes/components/drill/DashboardClickDrill";

import type { QueryMode } from "metabase-types/types/Visualization";

const PublicMode: QueryMode = {
  name: "public",
  drills: () => [DashboardClickDrill],
};

export default PublicMode;
