import { PLUGIN_SELECTORS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { initializePlugin, resetInitialization } from "./sdk-overrides";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const mockWhitelabelEnabled = (enabled: boolean) => {
  mockHasPremiumFeature.mockImplementation((feature) => {
    if (feature === "whitelabel") {
      return enabled;
    }
    return true; // Mock other features as enabled by default
  });
};

describe("SDK Plugin Initialization", () => {
  let originalGetNoDataIllustration: typeof PLUGIN_SELECTORS.getNoDataIllustration;
  let originalGetNoObjectIllustration: typeof PLUGIN_SELECTORS.getNoObjectIllustration;

  beforeAll(() => {
    // Store original selectors before all tests
    originalGetNoDataIllustration = PLUGIN_SELECTORS.getNoDataIllustration;
    originalGetNoObjectIllustration = PLUGIN_SELECTORS.getNoObjectIllustration;
  });

  afterEach(() => {
    // Reset mocks after each test
    jest.clearAllMocks();

    // Reset initialization state for next test
    resetInitialization();

    // Restore original selectors after each test
    PLUGIN_SELECTORS.getNoDataIllustration = originalGetNoDataIllustration;
    PLUGIN_SELECTORS.getNoObjectIllustration = originalGetNoObjectIllustration;
  });

  describe("when whitelabel feature is disabled", () => {
    beforeEach(() => {
      mockWhitelabelEnabled(false);
      initializePlugin();
    });

    it("should not initialize SDK plugins when whitelabel is disabled", () => {
      // Selectors should remain unchanged
      expect(PLUGIN_SELECTORS.getNoDataIllustration).toBe(
        originalGetNoDataIllustration,
      );
      expect(PLUGIN_SELECTORS.getNoObjectIllustration).toBe(
        originalGetNoObjectIllustration,
      );
    });
  });

  describe("when whitelabel feature is enabled", () => {
    beforeEach(() => {
      mockWhitelabelEnabled(true);
      initializePlugin();
    });

    it("should initialize SDK plugins and make selectors SDK-aware", () => {
      // Selectors should be different after initialization
      expect(PLUGIN_SELECTORS.getNoDataIllustration).not.toBe(
        originalGetNoDataIllustration,
      );
      expect(PLUGIN_SELECTORS.getNoObjectIllustration).not.toBe(
        originalGetNoObjectIllustration,
      );
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
      } as any;

      const result = PLUGIN_SELECTORS.getNoDataIllustration(mockState);

      expect(result).toBe(mockSdkIllustration);
      expect(mockSdkPlugins.getNoDataIllustration).toHaveBeenCalled();
    });

    it.each([null, undefined])(
      "should fall back to original selector when SDK plugin returns %s",
      (pluginReturnValue) => {
        const mockSdkPlugins = {
          getNoDataIllustration: jest.fn().mockReturnValue(pluginReturnValue),
        };

        const mockState = {
          sdk: {
            plugins: mockSdkPlugins,
          },
        } as any;

        // Should not throw an error when SDK plugin returns null
        expect(() => {
          PLUGIN_SELECTORS.getNoDataIllustration(mockState);
        }).not.toThrow();

        const result = PLUGIN_SELECTORS.getNoDataIllustration(mockState);
        const originalResult = originalGetNoDataIllustration(mockState);

        expect(result).toBe(originalResult);
        expect(mockSdkPlugins.getNoDataIllustration).toHaveBeenCalled();
      },
    );

    it("should handle missing SDK plugins gracefully", () => {
      const mockState = {
        sdk: {
          plugins: null,
        },
      } as any;

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
      } as any;

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

    it("should return SDK plugin result for getNoObjectIllustration when SDK plugins are available", () => {
      initializePlugin();

      const mockSdkIllustration = "custom-sdk-no-object-illustration.svg";
      const mockSdkPlugins = {
        getNoObjectIllustration: jest.fn().mockReturnValue(mockSdkIllustration),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as any;

      const result = PLUGIN_SELECTORS.getNoObjectIllustration(mockState);

      expect(result).toBe(mockSdkIllustration);
      expect(mockSdkPlugins.getNoObjectIllustration).toHaveBeenCalled();
    });

    it("should handle SDK getNoObjectIllustration plugin functions that return null", () => {
      const mockSdkPlugins = {
        getNoObjectIllustration: jest.fn().mockReturnValue(null),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as any;

      // Should not throw an error when SDK plugin returns null
      expect(() => {
        PLUGIN_SELECTORS.getNoObjectIllustration(mockState);
      }).not.toThrow();

      expect(PLUGIN_SELECTORS.getNoObjectIllustration(mockState)).toBeDefined();

      expect(mockSdkPlugins.getNoObjectIllustration).toHaveBeenCalled();
    });

    it("should handle SDK getNoObjectIllustration plugin functions that return undefined", () => {
      const mockSdkPlugins = {
        getNoObjectIllustration: jest.fn().mockReturnValue(undefined),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as any;

      // Should not throw an error when SDK plugin returns undefined
      expect(() => {
        PLUGIN_SELECTORS.getNoObjectIllustration(mockState);
      }).not.toThrow();
    });

    it("should handle missing SDK getNoObjectIllustration plugin gracefully", () => {
      const mockState = {
        sdk: {
          plugins: null,
        },
      } as any;

      // Should not throw an error when no SDK plugins are available
      expect(() => {
        PLUGIN_SELECTORS.getNoObjectIllustration(mockState);
      }).not.toThrow();
    });

    it("should handle errors in SDK getNoObjectIllustration plugin functions gracefully", () => {
      const mockSdkPlugins = {
        getNoObjectIllustration: jest.fn().mockImplementation(() => {
          throw new Error("Plugin error");
        }),
      };

      const mockState = {
        sdk: {
          plugins: mockSdkPlugins,
        },
      } as any;

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Should not throw an error even when SDK plugin throws
      expect(() => {
        PLUGIN_SELECTORS.getNoObjectIllustration(mockState);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error in SDK getNoObjectIllustration plugin:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should not initialize twice when called multiple times", () => {
      // First call is in beforeEach, get the selector reference
      const firstSelector = PLUGIN_SELECTORS.getNoDataIllustration;

      // Call initialize again
      initializePlugin();
      const secondSelector = PLUGIN_SELECTORS.getNoDataIllustration;

      // Should be the same selector instance (not re-wrapped)
      expect(firstSelector).toBe(secondSelector);
    });
  });
});
