import type { State } from "metabase-types/store";

export const getLocation = (state: State) =>
  state.routing.locationBeforeTransitions;
