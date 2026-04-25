import { registerVisualization } from "metabase/visualizations";

import { DashCardPlaceholder } from "./DashCardPlaceholder";
import { Heading } from "./Heading";
import { IFrameViz } from "./IFrameViz";
import { LinkViz } from "./LinkViz";
import { Text } from "./Text";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function () {
  registerVisualization(DashCardPlaceholder);
  registerVisualization(Heading);
  registerVisualization(LinkViz);
  registerVisualization(IFrameViz);
  registerVisualization(Text);
}
