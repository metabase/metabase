import { createMockSettingsState, createMockState } from "__support__/state";
import type { MetadataSelectorOpts } from "metabase/metadata-store";
// Reaches past the barrel on purpose. `getMetadata` is private to the module,
// and this file is the only door left to it: the v1 `Question` still takes a
// `Metadata` in its constructor, so specs that build one need this. See
// DEV-3382.
import { getMetadata } from "metabase/metadata-store/selectors";
import type { State } from "metabase/redux/store";
import type { Settings } from "metabase-types/api";

import type { EntitiesStateOpts } from "./store";
import { createMockEntitiesState } from "./store";

export function createMockMetadata(
  entities: EntitiesStateOpts = {},
  settings?: Settings,
  metadataOpts?: MetadataSelectorOpts,
) {
  const state = createMockState({
    entities: createMockEntitiesState(entities),
    settings: createMockSettingsState(settings),
  });

  return getMetadata(state, metadataOpts);
}

/**
 * The v1 `Metadata` for a state a test has already built, for specs that
 * render with that same state.
 */
export function createMockMetadataFromState(
  state: State,
  metadataOpts?: MetadataSelectorOpts,
) {
  return getMetadata(state, metadataOpts);
}
