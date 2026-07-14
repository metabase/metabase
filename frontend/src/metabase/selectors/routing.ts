import type { Location } from "history";

import type { State } from "metabase/redux/store";

const DEFAULT_LOCATION: Location = {
  pathname: "",
  search: "",
  query: {},
  hash: "",
  state: undefined,
  action: "POP",
  key: "",
};

export const getLocation = (state: State) =>
  state.routing?.locationBeforeTransitions ?? DEFAULT_LOCATION;
