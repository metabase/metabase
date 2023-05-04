import { getMetadata, MetadataSelectorOpts } from "metabase/selectors/metadata";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState, EntitiesStateOpts } from "./store";

export function createMockMetadata(
  entities: EntitiesStateOpts,
  opts?: MetadataSelectorOpts,
) {
  const state = createMockState({
    entities: createMockEntitiesState(entities),
  });
  return getMetadata(state, opts);
}
