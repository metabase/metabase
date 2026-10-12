import { Mode } from "metabase/querying/click-actions/Mode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import type { ClickActionsMode } from "metabase/visualizations/types";

export const PublicMode: QueryClickActionsMode = {
  name: "public",
  hasDrills: false,
  clickActions: [],
};

export const publicClickActionMode: ClickActionsMode = new Mode(
  () => PublicMode,
);
