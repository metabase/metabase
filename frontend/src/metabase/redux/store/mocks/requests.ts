import type { RequestsState } from "../requests";

export const createMockRequestsState = (
  opts: Partial<RequestsState> = {},
): RequestsState => {
  return {
    entities: {},
    plugins: {},
    ...opts,
  };
};
