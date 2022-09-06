import ActionClickDrill from "../drill/ActionClickDrill";
import DashboardClickDrill from "../drill/DashboardClickDrill";

const ActionMode = {
  name: "actions",
  drills: () => [ActionClickDrill, DashboardClickDrill],
};

export default ActionMode;
