import { act, renderHook } from "@testing-library/react";

import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

import { useDateFormatter } from "./use-date-formatter";

const formatDate = jest.fn(() => "one");
const formatDateRange = jest.fn(() => "both");

const setBundleGlobal = () => {
  // Only the two exports the hook reaches for; the rest of the contract is
  // irrelevant here.
  window.METABASE_EMBEDDING_SDK_BUNDLE = {
    formatDate,
    formatDateRange,
  } as unknown as MetabaseEmbeddingSdkBundleExports;
};

const markBundleLoaded = () => {
  ensureMetabaseProviderPropsStore().updateInternalProps({
    loadingState: SdkLoadingState.Loaded,
  });
};

afterEach(() => {
  delete window.METABASE_EMBEDDING_SDK_BUNDLE;
  ensureMetabaseProviderPropsStore().cleanup();
  jest.clearAllMocks();
});

describe("useDateFormatter", () => {
  it("formats nothing until the bundle is loaded", () => {
    const { result } = renderHook(() => useDateFormatter());

    expect(result.current.formatDate("2026-09-01")).toBe("");
    expect(result.current.formatDateRange(["2026-09-01", null])).toBe("");
  });

  it("delegates to the bundle's formatters once loaded", () => {
    setBundleGlobal();
    markBundleLoaded();

    const { result } = renderHook(() => useDateFormatter());

    expect(result.current.formatDate("2026-09-01", { format: "MMM D" })).toBe(
      "one",
    );
    expect(formatDate).toHaveBeenCalledWith("2026-09-01", { format: "MMM D" });
    expect(result.current.formatDateRange(["2026-09-01", "2026-09-10"])).toBe(
      "both",
    );
  });

  // The label is computed in the caller's render, so the hook has to bring the
  // caller back when the bundle lands — not leave it on the empty string.
  it("re-renders the caller with the real formatter when the bundle lands", () => {
    const { result } = renderHook(() => useDateFormatter());

    expect(result.current.formatDateRange(["2026-09-01", null])).toBe("");

    act(() => {
      setBundleGlobal();
      markBundleLoaded();
    });

    expect(result.current.formatDateRange(["2026-09-01", null])).toBe("both");
  });
});
