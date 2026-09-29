import { setupBasename } from "__support__/basename";
import { createMockSettingsState, createMockState } from "__support__/state";
import { setBasename } from "metabase/utils/basename";
import type { EnterpriseSettings } from "metabase-types/api";

import { getSetting, getSettings } from "./selectors";

const IMAGE_URL =
  "api/session/illustration/no-data-illustration-custom?v=0123456789abcdef";

const setup = (settings: Partial<EnterpriseSettings> = {}) =>
  createMockState({
    settings: createMockSettingsState({
      "no-data-illustration-custom": IMAGE_URL,
      ...settings,
    }),
  });

describe("getSettings", () => {
  describe.each([
    ["", IMAGE_URL],
    ["/metabase", `/metabase/${IMAGE_URL}`],
    [
      "https://mb.example.com/metabase",
      `https://mb.example.com/metabase/${IMAGE_URL}`,
    ],
  ])("with basename %j", (basename, expectedUrl) => {
    setupBasename(basename);

    it("prefixes uploaded image URLs with the basename", () => {
      const state = setup();

      expect(getSetting(state, "no-data-illustration-custom")).toBe(
        expectedUrl,
      );
    });

    it("does not change other values", () => {
      const dataUri = "data:image/png;base64,AAAA";
      const state = setup({
        "login-page-illustration-custom": dataUri,
        "no-object-illustration-custom": "https://example.com/image.png",
        "application-logo-url": "app/img/logo.svg",
        "enable-embedding-sdk": false,
      });

      expect(getSetting(state, "login-page-illustration-custom")).toBe(dataUri);
      expect(getSetting(state, "no-object-illustration-custom")).toBe(
        "https://example.com/image.png",
      );
      expect(getSetting(state, "application-logo-url")).toBe(
        "app/img/logo.svg",
      );
      expect(getSetting(state, "enable-embedding-sdk")).toBe(false);
    });
  });

  describe("when the basename changes", () => {
    setupBasename("/metabase");

    it("resolves the URLs again", () => {
      const state = setup();
      expect(getSetting(state, "no-data-illustration-custom")).toBe(
        `/metabase/${IMAGE_URL}`,
      );

      setBasename("/other");
      expect(getSetting(state, "no-data-illustration-custom")).toBe(
        `/other/${IMAGE_URL}`,
      );
    });
  });

  it("returns the same object on every read", () => {
    const state = setup();

    expect(getSettings(state)).toBe(getSettings(state));
  });

  it("returns the original object when there is nothing to resolve", () => {
    const state = setup({ "no-data-illustration-custom": undefined });

    expect(getSettings(state)).toBe(window.MetabaseBootstrap);
  });
});
