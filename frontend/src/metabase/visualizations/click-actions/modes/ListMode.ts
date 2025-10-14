import type { QueryClickActionsMode } from "../../types";

export const ListMode: QueryClickActionsMode = {
  name: "list",
  hasDrills: true,
  performSubsetOnlyDrills: false,
  availableOnlyDrills: ["drill-thru/sort"],
  clickActions: [],
};
