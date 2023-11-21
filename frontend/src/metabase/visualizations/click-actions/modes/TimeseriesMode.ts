import type { QueryClickActionsMode } from "../../types";
import { TimeseriesModeFooter } from "../components/TimeseriesModeFooter";
import { DefaultMode } from "./DefaultMode";

export const TimeseriesMode: QueryClickActionsMode = {
  name: "timeseries",
  clickActions: [...DefaultMode.clickActions],
  ModeFooter: TimeseriesModeFooter,
};
