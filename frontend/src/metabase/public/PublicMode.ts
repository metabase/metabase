import { Mode } from "metabase/querying/click-actions/Mode";
import type {
  ClickActionsMode,
  QueryClickActionsMode,
} from "metabase/visualizations/types";

export const PublicMode: QueryClickActionsMode = {
  name: "public",
  hasDrills: false,
  clickActions: [],
};

export const publicClickActionMode: ClickActionsMode = new Mode(
  () => PublicMode,
);
