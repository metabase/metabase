import { getMetadata } from "metabase/selectors/metadata";
import type { Settings } from "metabase-types/api";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import type { EntitiesStateOpts } from "./store";
import { createMockEntitiesState } from "./store";

export function createMockMetadata(
  entities: EntitiesStateOpts,
  settings?: Settings,
) {
  const state = createMockState({
    entities: createMockEntitiesState(entities),
    settings: createMockSettingsState(settings),
  });

  return getMetadata(state);
}
