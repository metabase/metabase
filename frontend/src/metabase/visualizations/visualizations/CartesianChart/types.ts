import type { HoveredObject } from "metabase/viz-core";

export interface CartesianHoveredObject extends HoveredObject {
  shouldShowTooltip?: boolean;
}
