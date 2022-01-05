import { Collection } from "metabase-types/api";

export const createCollection = (opts?: Partial<Collection>): Collection => ({
  id: 1,
  ...opts,
});
