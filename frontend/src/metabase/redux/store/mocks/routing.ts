import type { Location } from "history";

import type { RouterState } from "metabase/router";

export const createMockRoutingState = (
  opts?: Partial<RouterState>,
): RouterState => {
  const location = opts?.locationBeforeTransitions;
  return {
    ...opts,
    locationBeforeTransitions:
      location === null ? null : createMockLocation(location),
  };
};

export const createMockLocation = (opts?: Partial<Location>): Location => {
  return {
    pathname: "/",
    search: "",
    query: {},
    hash: "",
    state: undefined,
    action: "POP",
    key: "", // can be null at runtime but the history typings type it as string
    ...opts,
  };
};
