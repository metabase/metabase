import type { Location } from "metabase/router";

export const createMockLocation = (opts?: Partial<Location>): Location => {
  return {
    pathname: "/",
    search: "",
    hash: "",
    state: undefined,
    key: "", // can be null at runtime but the history typings type it as string
    ...opts,
  };
};
