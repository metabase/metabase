import type { QueryClickActionsMode } from "../../types";
import { DefaultMode } from "./DefaultMode";

export const MetricMode: QueryClickActionsMode = {
  name: "metric",
  clickActions: [...DefaultMode.clickActions],
};
