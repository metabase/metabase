import { queryModeToClickActionMode } from "metabase/querying/click-actions/lib/modes";
import type { QueryClickActionsMode } from "metabase/visualizations/types";

export const PublicMode: QueryClickActionsMode = {
  name: "public",
  hasDrills: false,
  clickActions: [],
};

export const publicClickActionMode = queryModeToClickActionMode(PublicMode);
