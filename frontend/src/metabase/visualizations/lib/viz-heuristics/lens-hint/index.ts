import type { VizHeuristic } from "../types";

import {
  LENS_HINT_DESCRIPTION,
  LENS_HINT_ID,
  LENS_HINT_LABEL,
} from "./constants";
import { resolveLensHint } from "./resolve";

export const lensHintHeuristic: VizHeuristic = {
  id: LENS_HINT_ID,
  label: LENS_HINT_LABEL,
  description: LENS_HINT_DESCRIPTION,
  resolve: resolveLensHint,
};
