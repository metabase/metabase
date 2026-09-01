import { createMockEntitiesState } from "__support__/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import { createMockSettings } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  selectMetadataProvider,
  selectMetadataProviderFactory,
  selectMetadataProviderUnfiltered,
  selectMetricMetadataProvider,
} from "./provider";
import { getMetadata } from "./selectors";

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

describe("selectMetricMetadataProvider", () => {
  it("returns the same provider for the same state", () => {
    expect(selectMetricMetadataProvider(state)).toBe(
      selectMetricMetadataProvider(state),
    );
  });

  it("is memoised here, not by metabase-lib", () => {
    const metadata = getMetadata(state);

    expect(LibMetric.metadataProvider(metadata)).not.toBe(
      LibMetric.metadataProvider(metadata),
    );
  });
});

describe("selectMetadataProviderFactory", () => {
  it("returns the same factory for the same state", () => {
    expect(selectMetadataProviderFactory(state)).toBe(
      selectMetadataProviderFactory(state),
    );
  });

  it("agrees with selectMetadataProvider", () => {
    const viaFactory = selectMetadataProviderFactory(state)(SAMPLE_DB_ID);
    const direct = selectMetadataProvider(state, SAMPLE_DB_ID);

    // compared as a boolean: a failing toBe would deep-diff a huge CLJS object
    expect(viaFactory === direct).toBe(true);
  });
});

describe("the Metadata object these selectors build on", () => {
  it("is the one plain getMetadata callers already hold", () => {
    // getMetadata is memoised per argument list, so passing an explicit
    // undefined would build a second Metadata, and with it a second set of
    // metabase-lib caches over the same data.
    const provider = selectMetadataProvider(state, SAMPLE_DB_ID);
    const fromPlainSelector = Lib.metadataProvider(
      SAMPLE_DB_ID,
      getMetadata(state),
    );

    expect(provider === fromPlainSelector).toBe(true);
  });

  it("splits when getMetadata is called with a different arity", () => {
    expect(getMetadata(state) === getMetadata(state, undefined)).toBe(false);
  });
});
