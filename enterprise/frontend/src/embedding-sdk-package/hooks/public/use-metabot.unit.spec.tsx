import { act, renderHook } from "@testing-library/react";

import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";
import { publishMetabotState } from "embedding-sdk-shared/lib/metabot-state-channel";

import { useMetabot } from "./use-metabot";

const makeMetabotResult = (
  overrides: Partial<UseMetabotResult> = {},
): UseMetabotResult => ({
  submitMessage: jest.fn().mockResolvedValue(undefined),
  retryMessage: jest.fn().mockResolvedValue(undefined),
  cancelRequest: jest.fn(),
  resetConversation: jest.fn(),
  messages: [],
  errorMessages: [],
  isProcessing: false,
  CurrentChart: null,
  ...overrides,
});

describe("useMetabot", () => {
  afterEach(() => {
    act(() => {
      publishMetabotState(null);
    });
  });

  it("returns null before the subscriber publishes", () => {
    const { result } = renderHook(() => useMetabot());

    expect(result.current).toBeNull();
  });

  it("returns the published value when the subscriber publishes", () => {
    const published = makeMetabotResult({ isProcessing: true });
    const { result } = renderHook(() => useMetabot());

    act(() => {
      publishMetabotState(published);
    });

    expect(result.current).toBe(published);
  });

  it("resets to null when the subscriber publishes null", () => {
    const published = makeMetabotResult();
    const { result } = renderHook(() => useMetabot());

    act(() => {
      publishMetabotState(published);
    });
    expect(result.current).toBe(published);

    act(() => {
      publishMetabotState(null);
    });
    expect(result.current).toBeNull();
  });

  it("unsubscribes on unmount", () => {
    const { result, unmount } = renderHook(() => useMetabot());
    const published = makeMetabotResult();

    unmount();

    // If unsubscribe did not run, the render count would still update the
    // unmounted hook's internal state. Publishing after unmount must not
    // throw and must not affect the last-seen value.
    expect(() => {
      act(() => {
        publishMetabotState(published);
      });
    }).not.toThrow();
    expect(result.current).toBeNull();
  });
});
