import { renderHook } from "@testing-library/react";

import {
  useSdkSelector,
  USE_OUTSIDE_OF_CONTEXT_MESSAGE,
} from "./use-sdk-selector";

describe("useSdkSelector", () => {
  it("should throw an error if used outside of the MetabaseProvider", () => {
    expect(() => {
      renderHook(() => useSdkSelector(s => s.sdk.token));
    }).toThrow(Error(USE_OUTSIDE_OF_CONTEXT_MESSAGE));
  });
});
