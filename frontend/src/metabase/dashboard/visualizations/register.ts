import ActionViz from "metabase/dashboard/components/ActionViz";
import { registerVisualization } from "metabase/visualizations";

import { DashCardPlaceholder } from "./DashCardPlaceholder";
import { Heading } from "./Heading";
import { IFrameViz } from "./IFrameViz";
import { LinkViz } from "./LinkViz";
import { Text } from "./Text";

export function registerDashboardVisualizations() {
  registerVisualization(ActionViz);
  registerVisualization(DashCardPlaceholder);
  registerVisualization(Heading);
  registerVisualization(LinkViz);
  registerVisualization(IFrameViz);
  registerVisualization(Text);
}
