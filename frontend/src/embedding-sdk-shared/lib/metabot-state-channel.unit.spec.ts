import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";

import {
  getMetabotStateSnapshot,
  publishMetabotState,
  subscribeMetabotState,
} from "./metabot-state-channel";

describe("metabot-state-channel", () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__MB_METABOT_STATE__;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__MB_METABOT_STATE__;
  });

  const makeResult = (overrides: Partial<UseMetabotResult> = {}) =>
    ({
      messages: [],
      isProcessing: false,
      ...overrides,
    }) as unknown as UseMetabotResult;

  it("returns null as the initial snapshot", () => {
    expect(getMetabotStateSnapshot()).toBeNull();
  });

  it("reflects the published value in the snapshot", () => {
    const published = makeResult();
    publishMetabotState(published);
    expect(getMetabotStateSnapshot()).toBe(published);
  });

  it("notifies a subscribed listener on publish and stops after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeMetabotState(listener);

    publishMetabotState(makeResult());
    expect(listener).toHaveBeenCalledTimes(1);

    publishMetabotState(makeResult());
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    publishMetabotState(makeResult());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("fans out publications to multiple listeners", () => {
    const firstListener = jest.fn();
    const secondListener = jest.fn();

    subscribeMetabotState(firstListener);
    subscribeMetabotState(secondListener);

    publishMetabotState(makeResult());

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
  });

  it("accepts null as a published value", () => {
    publishMetabotState(makeResult());
    publishMetabotState(null);
    expect(getMetabotStateSnapshot()).toBeNull();
  });
});
