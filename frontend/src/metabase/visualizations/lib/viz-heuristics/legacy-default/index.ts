import { resolveLegacyDefault } from "../shared";
import type { VizHeuristic } from "../types";

import {
  LEGACY_DEFAULT_DESCRIPTION,
  LEGACY_DEFAULT_ID,
  LEGACY_DEFAULT_LABEL,
} from "./constants";

export const legacyDefaultHeuristic: VizHeuristic = {
  id: LEGACY_DEFAULT_ID,
  label: LEGACY_DEFAULT_LABEL,
  description: LEGACY_DEFAULT_DESCRIPTION,
  resolve: resolveLegacyDefault,
};
