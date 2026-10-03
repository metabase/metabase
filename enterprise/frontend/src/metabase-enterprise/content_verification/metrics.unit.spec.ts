import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";

import { getDefaultMetricFilters } from "./metrics";

describe("getDefaultMetricFilters", () => {
  it("returns the same object reference across calls when the setting hasn't changed", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-metrics": true,
      }),
    });

    const first = getDefaultMetricFilters(state);
    const second = getDefaultMetricFilters(state);

    expect(first).toBe(second);
    expect(first).toEqual({ verified: true });
  });

  it("returns a new value when the underlying setting actually changes", () => {
    const stateOff = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-metrics": false,
      }),
    });
    const stateOn = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-metrics": true,
      }),
    });

    expect(getDefaultMetricFilters(stateOff)).toEqual({ verified: false });
    expect(getDefaultMetricFilters(stateOn)).toEqual({ verified: true });
  });

  it("defaults to false when the setting is unset", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "browse-filter-only-verified-metrics": undefined,
      }),
    });

    expect(getDefaultMetricFilters(state)).toEqual({ verified: false });
  });
});
