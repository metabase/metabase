import { createMockEntitiesState } from "__support__/store";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type { UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockParameter,
  createMockSettings,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  selectMetadataProvider,
  selectMetadataProviderFactory,
  selectMetadataProviderUnfiltered,
  selectMetricMetadataProvider,
  selectQuestionFromCard,
  selectQuestionFromOpts,
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
    const provider = selectMetadataProvider(state, SAMPLE_DB_ID);
    const fromPlainSelector = Lib.metadataProvider(
      SAMPLE_DB_ID,
      getMetadata(state),
    );

    expect(provider === fromPlainSelector).toBe(true);
  });

  it("does not split when getMetadata is called with a different arity", () => {
    // Reselect keys its cache on the argument list, so getMetadata
    // canonicalises its options. Without that, a bare call and an explicit
    // undefined build two Metadata objects over the same records.
    expect(getMetadata(state) === getMetadata(state, undefined)).toBe(true);
  });
});

describe("the question selectors", () => {
  it("build a question that carries the metadata", () => {
    const question = selectQuestionFromOpts(state, {
      DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DB_ID,
    });

    expect(question.databaseId()).toBe(SAMPLE_DB_ID);
  });

  it("wrap an existing card", () => {
    const card = createMockCard({ id: 1 });

    expect(selectQuestionFromCard(state, card).id()).toBe(card.id);
  });

  it("accept an unsaved card, which is what a draft question holds", () => {
    // `Card` extends `UnsavedCard`, so the door models the unsaved shape. A
    // `VirtualCard` has no `dataset_query` and so is still rejected, which the
    // type checker enforces rather than this test.
    const unsaved: UnsavedCard = {
      display: "table",
      dataset_query: createMockCard().dataset_query,
      visualization_settings: {},
    };

    expect(selectQuestionFromCard(state, unsaved).display()).toBe("table");
  });

  it("carry the parameter values the constructor takes", () => {
    const parameter = createMockParameter({ id: "p1" });
    const card = createMockCard({ id: 1, parameters: [parameter] });

    const question = selectQuestionFromCard(state, card, { p1: 42 });

    expect(question.parameters()).toEqual([
      expect.objectContaining({ id: "p1", value: 42 }),
    ]);
  });

  it("do not memoise the questions themselves", () => {
    // Each call builds a fresh Question, which is why the hooks return
    // builders rather than a question.
    expect(
      selectQuestionFromOpts(state, {}) === selectQuestionFromOpts(state, {}),
    ).toBe(false);
  });
});
