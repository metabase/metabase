import type { State } from "metabase-types/store";

export const getRouting = (state: State) => state.routing;

export const getLocation = (state: State) =>
  getRouting(state).locationBeforeTransitions;
