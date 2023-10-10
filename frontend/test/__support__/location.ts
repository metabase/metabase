import type { Location } from "history";

export const createMockLocation = (
  location: Partial<Location> = {},
): Location => {
  return {
    pathname: "",
    search: "",
    query: {},
    hash: "",
    state: null,
    action: "PUSH" as const,
    key: "",
    ...location,
  };
};
