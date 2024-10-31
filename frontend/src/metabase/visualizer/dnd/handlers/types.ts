import type { DragEndEvent } from "@dnd-kit/core";

import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Dispatch } from "metabase-types/store";

export type VizDropHandlerOpts = {
  event: DragEndEvent;
  settings: ComputedVisualizationSettings;
  dispatch: Dispatch;
};
