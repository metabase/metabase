import { Collection } from "metabase-types/api";

export const createMockCollection = (
  opts?: Partial<Collection>,
): Partial<Collection> => ({
  id: 1,
  name: "Collection",
  can_write: false,
  archived: false,
  ...opts,
});
