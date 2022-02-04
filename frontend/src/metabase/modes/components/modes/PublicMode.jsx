import DashboardClickDrill from "metabase/modes/components/drill/DashboardClickDrill";

const PublicMode = {
  name: "public",
  drills: () => [DashboardClickDrill],
};

export default PublicMode;
