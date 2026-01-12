import { act, renderHook } from "@testing-library/react";

// Mock dependencies BEFORE imports - these are hoisted by jest
jest.mock("metabase/api", () => ({
  skipToken: Symbol("skipToken"),
}));

jest.mock("metabase/common/hooks", () => ({
  useLocale: () => ({ locale: "de" }),
}));

jest.mock("metabase/i18n/types", () => ({}));

const mockUseListContentTranslationsQuery = jest.fn();
jest.mock("metabase-enterprise/api", () => ({
  useListContentTranslationsQuery: (...args: unknown[]) =>
    mockUseListContentTranslationsQuery(...args),
}));

import {
  contentTranslationEndpoints,
  dictionaryEndpointStore,
} from "./constants";
import { useTranslateContent } from "./use-translate-content";

describe("useTranslateContent - endpoint reactivity", () => {
  beforeEach(() => {
    // Reset endpoint to null before each test
    dictionaryEndpointStore.setEndpoint(null);
    mockUseListContentTranslationsQuery.mockReset();

    // Default mock: return translations when called with locale params
    mockUseListContentTranslationsQuery.mockImplementation((arg: unknown) => {
      // When arg is the skipToken symbol, return no data
      if (typeof arg === "symbol") {
        return { data: undefined };
      }
      // When arg has locale, return translations
      if (arg && typeof arg === "object" && "locale" in arg) {
        return {
          data: { data: [{ locale: "de", msgid: "Hello", msgstr: "Hallo" }] },
        };
      }
      return { data: undefined };
    });
  });

  it("should translate content after endpoint is set", () => {
    // Start with endpoint as null
    expect(contentTranslationEndpoints.getDictionary).toBeNull();

    const { result } = renderHook(() => useTranslateContent());

    // Initially, tc returns the original string (no translations loaded)
    expect(result.current("Hello")).toBe("Hello");

    // Now set the endpoint - this simulates what useEffect does in ContentTranslationsProvider
    // With useSyncExternalStore fix: this automatically triggers a re-render
    // Without the fix: React has no way to know the endpoint changed, so no re-render happens
    act(() => {
      dictionaryEndpointStore.setEndpoint(
        "/api/ee/content-translation/dictionary",
      );
    });

    // With the fix: tc("Hello") should return "Hallo"
    // Without the fix: tc("Hello") still returns "Hello" because component didn't re-render
    expect(result.current("Hello")).toBe("Hallo");
  });
});
