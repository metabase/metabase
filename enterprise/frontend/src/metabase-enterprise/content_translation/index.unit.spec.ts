import { renderHook } from "@testing-library/react";

import { mockSettings } from "__support__/settings";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import { reinitialize } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { useTranslateContent as useTranslateEnterpriseContent } from "./use-translate-content";

import { initializePlugin } from ".";

const expectDefault = () => {
  expect(PLUGIN_CONTENT_TRANSLATION.isEnabled).toBe(false);
  expect(PLUGIN_CONTENT_TRANSLATION.getDictionaryBasePath).toBeNull();
  const { result } = renderHook(() => useTranslateContent());
  expect(result.current("Hello")).toBe("Hello");
  expect(result.current("")).toBe("");
};
const expectEnabled = () => {
  expect(PLUGIN_CONTENT_TRANSLATION.isEnabled).toBe(true);
  expect(PLUGIN_CONTENT_TRANSLATION.getDictionaryBasePath).toBe(
    "/api/ee/content-translation/dictionary",
  );
  expect(PLUGIN_CONTENT_TRANSLATION.useTranslateContent).toBe(
    useTranslateEnterpriseContent,
  );
};

const initialize = (enabled?: boolean) => {
  mockSettings({
    "token-features":
      enabled === undefined
        ? undefined
        : createMockTokenFeatures({ content_translation: enabled }),
  });
  initializePlugin();
};

describe("content translation plugin registration", () => {
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
