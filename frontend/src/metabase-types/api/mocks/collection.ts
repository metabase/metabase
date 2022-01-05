import { Collection } from "metabase-types/api";

export const createMockCollection = (
  opts?: Partial<Collection>,
): Collection => ({
  id: 1,
  ...opts,
});
