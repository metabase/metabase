import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import { PLUGIN_SELECTORS } from "metabase/plugins";

import { initializeSdkPlugins } from "./index";

describe("SDK Plugin Initialization", () => {
  let originalGetNoDataIllustration: typeof PLUGIN_SELECTORS.getNoDataIllustration;

  beforeEach(() => {
    // Store original selector before each test
    originalGetNoDataIllustration = PLUGIN_SELECTORS.getNoDataIllustration;
  });

  afterEach(() => {
    // Restore original selector after each test
    PLUGIN_SELECTORS.getNoDataIllustration = originalGetNoDataIllustration;
  });

  describe("initializeSdkPlugins", () => {
    it("should initialize SDK plugins and make selectors SDK-aware", () => {
      const originalSelector = PLUGIN_SELECTORS.getNoDataIllustration;

      initializeSdkPlugins();

      // Selector should be different after initialization
      expect(PLUGIN_SELECTORS.getNoDataIllustration).not.toBe(originalSelector);
    });

    it("should return SDK plugin result when SDK plugins are available", () => {
      const mockSdkIllustration = "custom-sdk-illustration.svg";
      const mockSdkPlugins = {
        getNoDataIllustration: jest.fn().mockReturnValue(mockSdkIllustration),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as SdkStoreState;

      initializeSdkPlugins();

      const result = PLUGIN_SELECTORS.getNoDataIllustration(mockState);

      expect(result).toBe(mockSdkIllustration);
      expect(mockSdkPlugins.getNoDataIllustration).toHaveBeenCalled();
    });

    it("should handle SDK plugin functions that return null", () => {
      const mockSdkPlugins = {
        getNoDataIllustration: jest.fn().mockReturnValue(null),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as SdkStoreState;

      initializeSdkPlugins();

      // Should not throw an error when SDK plugin returns null
      expect(() => {
        PLUGIN_SELECTORS.getNoDataIllustration(mockState);
      }).not.toThrow();

      expect(mockSdkPlugins.getNoDataIllustration).toHaveBeenCalled();
    });

    it("should handle SDK plugin functions that return undefined", () => {
      const mockSdkPlugins = {
        getNoDataIllustration: jest.fn().mockReturnValue(undefined),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as SdkStoreState;

      initializeSdkPlugins();

      // Should not throw an error when SDK plugin returns undefined
      expect(() => {
        PLUGIN_SELECTORS.getNoDataIllustration(mockState);
      }).not.toThrow();
    });

    it("should handle missing SDK plugins gracefully", () => {
      const mockState = {
        sdk: {
          plugins: null,
        },
      } as SdkStoreState;

      initializeSdkPlugins();

      // Should not throw an error when no SDK plugins are available
      expect(() => {
        PLUGIN_SELECTORS.getNoDataIllustration(mockState);
      }).not.toThrow();
    });

    it("should handle errors in SDK plugin functions gracefully", () => {
      const mockSdkPlugins = {
        getNoDataIllustration: jest.fn().mockImplementation(() => {
          throw new Error("Plugin error");
        }),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as SdkStoreState;

      initializeSdkPlugins();

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Should not throw an error even when SDK plugin throws
      expect(() => {
        PLUGIN_SELECTORS.getNoDataIllustration(mockState);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error in SDK getNoDataIllustration plugin:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });
});
