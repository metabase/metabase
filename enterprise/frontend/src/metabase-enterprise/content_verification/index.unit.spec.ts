import { mockSettings } from "__support__/settings";
import { PLUGIN_CONTENT_VERIFICATION, reinitialize } from "metabase/plugins";
import { PLUGIN_SEARCH_FILTERS } from "metabase/search/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { VerifiedFilter } from "./VerifiedFilter";

import { initializePlugin } from ".";

const expectDefault = () => {
  expect(PLUGIN_CONTENT_VERIFICATION.contentVerificationEnabled).toBe(false);
  expect(PLUGIN_SEARCH_FILTERS.VerifiedFilter).toEqual({});
};
const expectEnabled = () => {
  expect(PLUGIN_CONTENT_VERIFICATION.contentVerificationEnabled).toBe(true);
  expect(PLUGIN_SEARCH_FILTERS.VerifiedFilter).toBe(VerifiedFilter);
};

const initialize = (enabled?: boolean) => {
  mockSettings({
    "token-features":
      enabled === undefined
        ? undefined
        : createMockTokenFeatures({ content_verification: enabled }),
  });
  initializePlugin();
};

describe("content verification plugin registration", () => {
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
