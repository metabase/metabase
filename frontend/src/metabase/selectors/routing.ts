import type { State } from "metabase/redux/store";

const DEFAULT_LOCATION = { pathname: "" };

export const getLocation = (state: State) =>
  state.routing?.locationBeforeTransitions ?? DEFAULT_LOCATION;
