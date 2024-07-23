import { renderHook } from "@testing-library/react";

import {
  useMetabaseAuthStatus,
  USE_OUTSIDE_OF_CONTEXT_MESSAGE,
} from "./use-metabase-auth-status";

describe("useMetabaseAuthStatus", () => {
  it("should throw an error if used outside of the MetabaseProvider", () => {
    expect(() => {
      renderHook(() => useMetabaseAuthStatus());
    }).toThrow(Error(USE_OUTSIDE_OF_CONTEXT_MESSAGE));
  });
});
