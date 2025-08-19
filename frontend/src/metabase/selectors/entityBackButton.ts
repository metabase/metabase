import type { State } from "metabase-types/store";

export const getBackDestination = (state: State) =>
  state.entityBackButton.destination;
