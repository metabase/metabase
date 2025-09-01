import type { QueryClickActionsMode } from "../../types";

export const ListMode: QueryClickActionsMode = {
  name: "list",
  hasDrills: true,
  availableOnlyDrills: ["drill-thru/sort"],
  clickActions: [],
};
