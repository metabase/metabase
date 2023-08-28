import type { QueryMode } from "metabase/visualizations/types";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const PublicMode: QueryMode = {
  name: "public",
  drills: [DashboardClickAction],
};
