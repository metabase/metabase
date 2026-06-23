import { sdk, setSdkTrackerReady } from "./reducer";

describe("sdk reducer — sdkTrackerReady", () => {
  it("has sdkTrackerReady: false in the initial state", () => {
    const state = sdk(undefined, { type: "@@INIT" });
    expect(state.sdkTrackerReady).toBe(false);
  });

  it("sets sdkTrackerReady to true", () => {
    const state = sdk(undefined, setSdkTrackerReady(true));
    expect(state.sdkTrackerReady).toBe(true);
  });

  it("sets sdkTrackerReady to false", () => {
    const stateWithTrue = sdk(undefined, setSdkTrackerReady(true));
    const state = sdk(stateWithTrue, setSdkTrackerReady(false));
    expect(state.sdkTrackerReady).toBe(false);
  });
});
