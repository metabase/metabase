import type { QueryClickActionsMode } from "../../types";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const PublicMode: QueryClickActionsMode = {
  name: "public",
  hasDrills: false,
  clickActions: [DashboardClickAction],
};
