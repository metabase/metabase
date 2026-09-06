import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";

import { getDefaultModelFilters } from "./models";

describe("getDefaultModelFilters", () => {
  it("returns the same object reference across calls when the setting hasn't changed", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-models": true,
      }),
    });

    const first = getDefaultModelFilters(state);
    const second = getDefaultModelFilters(state);

    expect(first).toBe(second);
    expect(first).toEqual({ verified: true });
  });

  it("returns a new value when the underlying setting actually changes", () => {
    const stateOff = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-models": false,
      }),
    });
    const stateOn = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-models": true,
      }),
    });

    expect(getDefaultModelFilters(stateOff)).toEqual({ verified: false });
    expect(getDefaultModelFilters(stateOn)).toEqual({ verified: true });
  });

  it("defaults to false when the setting is unset", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-models": undefined,
      }),
    });

    expect(getDefaultModelFilters(state)).toEqual({ verified: false });
  });
});
