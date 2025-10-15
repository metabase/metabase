import { renderHook } from "__support__/ui";

import {
  USE_OUTSIDE_OF_CONTEXT_MESSAGE,
  useSdkSelector,
} from "./use-sdk-selector";

describe("useSdkSelector", () => {
  it("should throw an error if used outside of the MetabaseProvider", () => {
    expect(() => {
      renderHook(() => useSdkSelector((s) => s.sdk.token));
    }).toThrow(Error(USE_OUTSIDE_OF_CONTEXT_MESSAGE));
  });
});
