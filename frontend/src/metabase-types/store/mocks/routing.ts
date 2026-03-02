import type { Location } from "history";

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
