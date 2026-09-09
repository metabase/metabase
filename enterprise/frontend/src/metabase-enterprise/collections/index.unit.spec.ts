import { renderHook } from "@testing-library/react";

import { mockSettings } from "__support__/settings";
import { PLUGIN_ENTITY_ICON } from "metabase/hooks/plugins";
import { useGetIcon } from "metabase/hooks/use-icon";
import { reinitialize } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { useGetIcon as useGetEnterpriseIcon } from "./utils";

import { initializePlugin } from ".";

const expectDefault = () => {
  const { result } = renderHook(() => useGetIcon());
  expect(
    result.current({ model: "collection", authority_level: "official" }),
  ).toEqual({ name: "folder" });
};
const expectEnabled = () => {
  expect(PLUGIN_ENTITY_ICON.useGetIcon).toBe(useGetEnterpriseIcon);
  const { result } = renderHook(() => useGetIcon());
  expect(
    result.current({ model: "collection", authority_level: "official" }).name,
  ).toBe("official_collection");
};

const initialize = (enabled?: boolean) => {
  mockSettings({
    "token-features":
      enabled === undefined
        ? undefined
        : createMockTokenFeatures({ official_collections: enabled }),
  });
  initializePlugin();
};

describe("collections plugin registration", () => {
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
