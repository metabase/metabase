import type { QueryMode } from "../types";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const PublicMode: QueryMode = {
  name: "public",
  drills: [DashboardClickAction],
};
