import type { QueryClickActionsMode } from "metabase/visualizations/types";

export const ListMode: QueryClickActionsMode = {
  name: "list",
  hasDrills: true,
  availableOnlyDrills: ["drill-thru/sort"],
  clickActions: [],
};
