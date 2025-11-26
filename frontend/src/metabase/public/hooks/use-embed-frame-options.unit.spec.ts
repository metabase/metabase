import { renderHook } from "@testing-library/react";

import { parseHashOptions } from "metabase/lib/browser";

import { useEmbedFrameOptions } from "./use-embed-frame-options";

// Mock dependencies
jest.mock("metabase/common/hooks/use-docs-url", () => ({
  useDocsUrl: jest.fn(() => ({
    url: "https://docs.metabase.com/embedding/static-embedding-parameters",
  })),
}));

jest.mock("metabase/lib/browser", () => ({
  parseHashOptions: jest.fn(),
}));

jest.mock("metabase/lib/dom", () => ({
  isWithinIframe: jest.fn(),
}));

jest.mock("metabase/plugins", () => ({
  PLUGIN_RESOURCE_DOWNLOADS: {
    areDownloadsEnabled: jest.fn(),
  },
}));

jest.mock("../constants", () => ({
  DEFAULT_EMBED_DISPLAY_PARAMS: {
    titled: true,
    theme: "light",
    hideParameters: "sidebar",
    downloadsEnabled: true,
  },
}));

const mockParseHashOptions = parseHashOptions as jest.MockedFunction<
  typeof parseHashOptions
>;

describe("useEmbedFrameOptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseHashOptions.mockReturnValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("theme handling", () => {
    it("should return default theme when no theme is provided in hash", () => {
      mockParseHashOptions.mockReturnValue({});
      const location = { hash: "" };

      const { result } = renderHook(() => useEmbedFrameOptions({ location }));

      expect(result.current.theme).toBe("light");
    });

    it("should use theme from hash options", () => {
      mockParseHashOptions.mockReturnValue({
        theme: "night",
      });

      const location = { hash: "#theme=night" };
      const { result } = renderHook(() => useEmbedFrameOptions({ location }));

      expect(result.current.theme).toBe("night");
    });

    it("should handle transparent theme", () => {
      mockParseHashOptions.mockReturnValue({
        theme: "transparent",
      });

      const location = { hash: "#theme=transparent" };
      const { result } = renderHook(() => useEmbedFrameOptions({ location }));

      expect(result.current.theme).toBe("transparent");
    });
  });

  describe("hash change events for theme", () => {
    it("should not listen to hash changes when listenToHashChangeEvents is false", () => {
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");
      const location = { hash: "" };

      renderHook(() =>
        useEmbedFrameOptions({ location, listenToHashChangeEvents: false }),
      );

      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );
    });

    it("should listen to hash changes when listenToHashChangeEvents is true", () => {
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");
      const location = { hash: "" };

      renderHook(() =>
        useEmbedFrameOptions({ location, listenToHashChangeEvents: true }),
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );
    });

    it("should clean up event listener on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");
      const location = { hash: "" };

      const { unmount } = renderHook(() =>
        useEmbedFrameOptions({ location, listenToHashChangeEvents: true }),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );
    });

    it("should register theme state for hash change updates", () => {
      mockParseHashOptions.mockReturnValue({
        theme: "light",
      });

      const location = { hash: "#theme=light" };
      const { result } = renderHook(() =>
        useEmbedFrameOptions({ location, listenToHashChangeEvents: true }),
      );

      expect(result.current.theme).toBe("light");

      // Verify the theme state is managed internally
      expect(typeof result.current.theme).toBe("string");
    });
  });
});
