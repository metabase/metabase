import { registerVisualization } from "metabase/visualizations";

import { DashCardPlaceholder } from "./DashCardPlaceholder";
import { Heading } from "./Heading";
import { IFrameViz } from "./IFrameViz";
import { LinkViz } from "./LinkViz";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function () {
  registerVisualization(DashCardPlaceholder);
  registerVisualization(Heading);
  registerVisualization(LinkViz);
  registerVisualization(IFrameViz);
}
