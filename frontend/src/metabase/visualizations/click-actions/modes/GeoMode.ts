import type { QueryClickActionsMode } from "../../types";
import { DefaultMode } from "./DefaultMode";

export const GeoMode: QueryClickActionsMode = {
  name: "geo",
  clickActions: [...DefaultMode.clickActions],
};
