import { Collection } from "metabase-types/api";

export const createMockCollection = (
  opts?: Partial<Collection>,
): Collection => ({
  id: 1,
  name: "Collection",
  description: null,
  can_write: false,
  archived: false,
  ...opts,
});
