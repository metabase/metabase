import type { Lens } from "../../types";

export type LensTab = {
  key: string;
  title: string;
  isStatic?: boolean;
  lens: Lens;
  isFullyLoaded?: boolean;
};
