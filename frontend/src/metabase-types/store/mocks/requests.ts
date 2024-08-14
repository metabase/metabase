import type { RequestsState } from "../requests";

export const createMockRequestsState = (): RequestsState => {
  return {
    entities: {},
    plugins: {},
  };
};
