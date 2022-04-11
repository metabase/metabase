import { EntitiesState } from "metabase-types/store";

export const createMockEntitiesState = (
  opts?: Partial<EntitiesState>,
): EntitiesState => ({
  ...opts,
});
