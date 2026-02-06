import type { Lens } from "../../types";
import { getLensKey, isDrillLens } from "../../utils";

import type { LensTab } from "./types";

export const createTab = (lens: Lens): LensTab => {
  if (isDrillLens(lens)) {
    return {
      key: getLensKey(lens),
      title: lens.reason ?? lens.lens_id,
      isStatic: false,
      lens,
    };
  }
  return {
    key: lens.id,
    title: lens.display_name,
    isStatic: true,
    lens,
  };
};
