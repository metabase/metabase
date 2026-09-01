import { createMockEntitiesState } from "__support__/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  selectMetadataProvider,
  selectMetadataProviderUnfiltered,
} from "./provider";

const state = createMockState({
  entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  settings: createMockSettingsState(createMockSettings()),
});

describe("selectMetadataProvider", () => {
  it("returns the same provider for the same state and database", () => {
    expect(selectMetadataProvider(state, SAMPLE_DB_ID)).toBe(
      selectMetadataProvider(state, SAMPLE_DB_ID),
    );
  });

  it("returns a different provider per database", () => {
    expect(selectMetadataProvider(state, SAMPLE_DB_ID)).not.toBe(
      selectMetadataProvider(state, SAMPLE_DB_ID + 1),
    );
  });

  it("is stable for the unfiltered variant too", () => {
    expect(selectMetadataProviderUnfiltered(state, SAMPLE_DB_ID)).toBe(
      selectMetadataProviderUnfiltered(state, SAMPLE_DB_ID),
    );
  });

  it("separates the filtered and unfiltered providers", () => {
    expect(selectMetadataProvider(state, SAMPLE_DB_ID)).not.toBe(
      selectMetadataProviderUnfiltered(state, SAMPLE_DB_ID),
    );
  });
});
