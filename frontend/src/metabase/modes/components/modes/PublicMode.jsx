import type { QueryMode } from "metabase-types/types/Visualization";
import DashboardClickDrill from "metabase/modes/components/drill/DashboardClickDrill";

const PublicMode: QueryMode = {
  name: "public",
  drills: () => [DashboardClickDrill],
};

export default PublicMode;
