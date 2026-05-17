import { renderHook } from "__support__/ui-minimal";

import {
  USE_OUTSIDE_OF_CONTEXT_MESSAGE,
  useSdkSelector,
} from "./use-sdk-selector";

describe("useSdkSelector", () => {
  it("should throw an error if used outside of the MetabaseProvider", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      expect(() => {
        renderHook(() => useSdkSelector((s) => s.sdk.token));
      }).toThrow(Error(USE_OUTSIDE_OF_CONTEXT_MESSAGE));
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
