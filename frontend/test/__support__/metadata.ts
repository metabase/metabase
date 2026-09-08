import type { MetadataSelectorOpts } from "metabase/metadata-store";
import { getMetadata } from "metabase/metadata-store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
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
