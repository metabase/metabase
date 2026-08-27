import type { HoveredObject } from "metabase/visualizations/types";

export interface CartesianHoveredObject extends HoveredObject {
  shouldShowTooltip?: boolean;
}
