import { setupBasename } from "__support__/basename";
import { createMockSettingsState, createMockState } from "__support__/state";
import { setBasename } from "metabase/utils/basename";
import type { EnterpriseSettings } from "metabase-types/api";

import { getCustomIllustrationUrl } from "./selectors";

const IMAGE_URL =
  "api/session/illustration/no-data-illustration-custom?v=0123456789abcdef";

const setup = (settings: Partial<EnterpriseSettings> = {}) =>
  createMockState({
    settings: createMockSettingsState({
      "no-data-illustration-custom": IMAGE_URL,
      ...settings,
    }),
  });

describe("getCustomIllustrationUrl", () => {
  describe.each([
    ["", IMAGE_URL],
    ["/metabase", `/metabase/${IMAGE_URL}`],
    [
      "https://mb.example.com/metabase",
      `https://mb.example.com/metabase/${IMAGE_URL}`,
    ],
  ])("with basename %j", (basename, expectedUrl) => {
    setupBasename(basename);

    it("prefixes an uploaded image URL with the basename", () => {
      const state = setup();

      expect(
        getCustomIllustrationUrl(state, "no-data-illustration-custom"),
      ).toBe(expectedUrl);
    });

    it("does not change other values", () => {
      const state = setup({
        "login-page-illustration-custom": "data:image/png;base64,AAAA",
        "no-object-illustration-custom": "https://example.com/image.png",
        "landing-page-illustration-custom": undefined,
      });

      expect(
        getCustomIllustrationUrl(state, "login-page-illustration-custom"),
      ).toBe("data:image/png;base64,AAAA");
      expect(
        getCustomIllustrationUrl(state, "no-object-illustration-custom"),
      ).toBe("https://example.com/image.png");
      expect(
        getCustomIllustrationUrl(state, "landing-page-illustration-custom"),
      ).toBeUndefined();
    });
  });

  describe("when the basename changes", () => {
    setupBasename("/metabase");

    it("resolves the URL again", () => {
      const state = setup();
      expect(
        getCustomIllustrationUrl(state, "no-data-illustration-custom"),
      ).toBe(`/metabase/${IMAGE_URL}`);

      setBasename("/other");
      expect(
        getCustomIllustrationUrl(state, "no-data-illustration-custom"),
      ).toBe(`/other/${IMAGE_URL}`);
    });
  });
});
