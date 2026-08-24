import type { HoveredObject } from "metabase/viz-core/types";

export interface CartesianHoveredObject extends HoveredObject {
  shouldShowTooltip?: boolean;
}
