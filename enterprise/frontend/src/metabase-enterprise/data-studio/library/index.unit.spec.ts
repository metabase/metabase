import { mockSettings } from "__support__/settings";
import { PLUGIN_LIBRARY, reinitialize } from "metabase/plugins";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import { PLUGIN_DATA_REFERENCE } from "metabase/querying/components/DataReference/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { DataReferenceLibraryPane } from "./DataReferenceLibraryPane";

import { initializePlugin } from ".";

const expectDefault = () => {
  expect(PLUGIN_LIBRARY.isEnabled).toBe(false);
  expect(PLUGIN_DATA_REFERENCE.LibraryPane).toBe(PluginPlaceholder);
};
const expectEnabled = () => {
  expect(PLUGIN_LIBRARY.isEnabled).toBe(true);
  expect(PLUGIN_DATA_REFERENCE.LibraryPane).toBe(DataReferenceLibraryPane);
};

const initialize = (enabled?: boolean) => {
  mockSettings({
    "token-features":
      enabled === undefined
        ? undefined
        : createMockTokenFeatures({ library: enabled }),
  });
  initializePlugin();
};

describe("library plugin registration", () => {
  beforeEach(() => {
    reinitialize();
  });

  afterEach(() => {
    reinitialize();
  });

  it("should keep OSS defaults before token features are loaded", () => {
    initialize();
    expectDefault();
  });

  it("should keep OSS defaults when the feature is disabled", () => {
    initialize(false);
    expectDefault();
  });

  it("should register the enterprise implementation when the feature is enabled", () => {
    initialize(true);
    expectEnabled();
  });

  it("should restore OSS defaults after reset and allow enterprise registration again", () => {
    initialize(true);
    expectEnabled();

    reinitialize();
    expectDefault();

    initialize(false);
    expectDefault();

    initialize(true);
    expectEnabled();
  });
});
