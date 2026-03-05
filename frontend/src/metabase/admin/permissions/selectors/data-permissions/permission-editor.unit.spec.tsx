import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { getShouldShowTransformPermissions } from "./permission-editor";

describe("getShouldShowTransformPermissions", () => {
  describe("OSS version", () => {
    it("should return false for OSS version regardless of other settings", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": false,
          "transforms-enabled": true,
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });
  });

  describe("Pro Self-Hosted", () => {
    it("should return true when transforms feature and setting are both enabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": false,
          "transforms-enabled": true,
          "token-features": createMockTokenFeatures({ transforms: true }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(true);
    });

    it("should return false when transforms feature is enabled but setting is disabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": false,
          "transforms-enabled": false,
          "token-features": createMockTokenFeatures({ transforms: true }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });
  });

  describe("Pro Cloud", () => {
    it("should return true when transforms feature is enabled (ignores setting)", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": true,
          "transforms-enabled": false,
          "token-features": createMockTokenFeatures({ transforms: true }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(true);
    });

    it("should return false when transforms feature is disabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": true,
          "transforms-enabled": false,
          "token-features": createMockTokenFeatures({ transforms: false }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });

    it("should return false when transforms feature is disabled even when the setting is enabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": true,
          "transforms-enabled": true,
          "token-features": createMockTokenFeatures({ transforms: false }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });
  });
});
