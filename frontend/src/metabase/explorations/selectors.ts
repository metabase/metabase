import type { State } from "metabase/redux/store";

export const getCurrentExploration = (state: State) =>
  state.explorations.currentExploration;
