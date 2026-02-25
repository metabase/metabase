import type { Location } from "history";

import type { RoutingState } from "metabase-types/store";

export const createMockRoutingState = (
  opts?: Partial<RoutingState>,
): RoutingState => {
  return {
    ...opts,
    locationBeforeTransitions: createMockLocation(
      opts?.locationBeforeTransitions,
    ),
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
    key: "", // can be null but react-router-redux@4.0.8 typings are inaccurate
    ...opts,
  };
};
