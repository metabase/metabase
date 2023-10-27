import type { StoreTokenStatus } from "metabase-types/api";

export const createMockStoreTokenStatus = (
  opts?: Partial<StoreTokenStatus>,
): StoreTokenStatus => ({
  ...opts,
  valid: false,
  trial: false,
});
