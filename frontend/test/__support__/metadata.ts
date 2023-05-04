import { getMetadata, MetadataSelectorOpts } from "metabase/selectors/metadata";
import { createMockState } from "metabase-types/store/mocks";
import { createEntitiesState, EntitiesStateOpts } from "./store";

export function createMockMetadata(
  entities: EntitiesStateOpts,
  opts?: MetadataSelectorOpts,
) {
  const state = createMockState({ entities: createEntitiesState(entities) });
  const metadata = getMetadata(state, opts);
  return { metadata, state };
}
