import type { VizHeuristic } from "../types";

import {
  DIMENSION_TYPE_DESCRIPTION,
  DIMENSION_TYPE_ID,
  DIMENSION_TYPE_LABEL,
} from "./constants";
import { resolveByDimensionType } from "./resolve";

export const dimensionTypeHeuristic: VizHeuristic = {
  id: DIMENSION_TYPE_ID,
  label: DIMENSION_TYPE_LABEL,
  description: DIMENSION_TYPE_DESCRIPTION,
  resolve: resolveByDimensionType,
};
