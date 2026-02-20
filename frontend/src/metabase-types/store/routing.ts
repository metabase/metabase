import type { Location } from "history";

export type RouterLocation = Location & {
  query?: Record<string, unknown>;
};

export type RouterState = {
  locationBeforeTransitions: RouterLocation;
};
