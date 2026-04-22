import { render } from "@testing-library/react";

import { getSdkStore } from "embedding-sdk-bundle/store";
import { getMetabotStateSnapshot } from "embedding-sdk-shared/lib/metabot-state-channel";

import { MetabotSubscriber } from "./MetabotSubscriber";

// In jsdom, the EE plugin is not loaded, so `METABOT_SDK_EE_PLUGIN.MetabotProvider`
// defaults to `({ children }) => children`. We rely on a non-null channel
// snapshot to prove the inner tree ran — this implicitly covers both the
// redux provider boundary and the MetabotProvider pass-through.
describe("MetabotSubscriber", () => {
  afterEach(() => {
    // Reset the module-level channel to isolate from neighbor specs.
    delete (window as unknown as { __MB_METABOT_STATE__?: unknown })
      .__MB_METABOT_STATE__;
  });

  it("publishes a `UseMetabotResult`-shaped value on mount and clears it on unmount", () => {
    expect(getMetabotStateSnapshot()).toBeNull();

    const store = getSdkStore();
    const { unmount } = render(<MetabotSubscriber store={store} />);

    const snapshot = getMetabotStateSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot).toEqual(
      expect.objectContaining({
        submitMessage: expect.any(Function),
        retryMessage: expect.any(Function),
        cancelRequest: expect.any(Function),
        resetConversation: expect.any(Function),
        messages: expect.any(Array),
        errorMessages: expect.any(Array),
        isProcessing: expect.any(Boolean),
      }),
    );
    // `CurrentChart` is `null` until `navigateToPath` + chart context are set
    // — we only assert the key is present.
    expect(snapshot).toHaveProperty("CurrentChart");

    unmount();

    expect(getMetabotStateSnapshot()).toBeNull();
  });
});
