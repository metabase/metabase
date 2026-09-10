import type { VizHeuristic } from "../types";

import {
  DEFAULT_VIZ_V1_DESCRIPTION,
  DEFAULT_VIZ_V1_ID,
  DEFAULT_VIZ_V1_LABEL,
} from "./constants";
import { resolveDefaultVizV1 } from "./resolve";

export const defaultVizV1Heuristic: VizHeuristic = {
  id: DEFAULT_VIZ_V1_ID,
  label: DEFAULT_VIZ_V1_LABEL,
  description: DEFAULT_VIZ_V1_DESCRIPTION,
  resolve: resolveDefaultVizV1,
};
