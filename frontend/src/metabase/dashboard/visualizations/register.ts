import ActionViz from "metabase/dashboard/components/ActionViz";
import { registerVisualization } from "metabase/visualizations";

import { DashCardPlaceholder } from "./DashCardPlaceholder";
import { Heading } from "./Heading";
import { IFrameViz } from "./IFrameViz";
import { LinkViz } from "./LinkViz";
import { Text } from "./Text";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function (): void {
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ActionViz);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(DashCardPlaceholder);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Heading);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(LinkViz);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(IFrameViz);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Text);
}
