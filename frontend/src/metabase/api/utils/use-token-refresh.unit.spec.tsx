import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupTokenRefreshEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TokenStatusFeature } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenStatus,
} from "metabase-types/api/mocks";

import { useGetSettingsQuery } from "../session";

import { useTokenRefresh, useTokenRefreshUntil } from "./use-token-refresh";

const TestComponent = () => {
  useTokenRefresh();
  const { isFetching } = useGetSettingsQuery();

  if (isFetching) {
    return <div>Loading...</div>;
  }

  return <div>Test</div>;
};

const waitForElevenSeconds = async () => {
  act(() => {
    jest.advanceTimersByTime(11 * 1000);
  });
  await screen.findByText("Test");
};

const setupRefreshableProperties = ({
  hasRefresh,
}: {
  hasRefresh: boolean;
}) => {
  const settings = createMockSettings({
    "site-name": "Test",
    "token-status": {
      valid: true,
      status: "Token is Valid.",
      features: hasRefresh ? ["refresh-token-features"] : [],
    },
  });
  setupPropertiesEndpoints(settings);
};

const setup = async (hasRefresh = true) => {
  setupRefreshableProperties({ hasRefresh });
  renderWithProviders(<TestComponent />);
  await screen.findByText("Loading...");
  await screen.findByText("Test");
  return waitForGets(1);
};

const waitForGets = async (count: number) => {
  return waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets.length).toBe(count);
  });
};

beforeAll(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterAll(() => {
  jest.useRealTimers();
});

describe("useTokenRefresh", () => {
  it("should refetch every 10 seconds", async () => {
    await setup(true); // always start with 1 request
    await waitForElevenSeconds(); // 2
    expect((await findRequests("GET")).length).toBe(2);
    await waitForElevenSeconds(); // 3
    await waitForElevenSeconds(); // 4
    await waitForGets(4);
    expect((await findRequests("GET")).length).toBe(4);
  });

  it("should not refetch if the token lacks a refresh flag", async () => {
    await setup(false);
    await waitForElevenSeconds();
    await waitForElevenSeconds();
    await waitForElevenSeconds();
    const gets = await findRequests("GET");
    expect(gets.length).toBe(1);
  });

  it("should stop refetching once the token gets a refresh flag", async () => {
    await setup(true); // always start with 1 request

    await waitForElevenSeconds();
    await waitForGets(2);

    setupRefreshableProperties({ hasRefresh: false }); // remove the refresh flag
    await waitForElevenSeconds();
    await waitForGets(3); // should get one more

    await waitForElevenSeconds();
    await waitForElevenSeconds();

    const gets = await findRequests("GET"); // should still be 3
    expect(gets.length).toBe(3);
  });
});

const TOKEN_FEATURE: TokenStatusFeature = "attached-dwh";
const UNTIL_INTERVAL_MS = 1000;

const UntilTestComponent = ({
  skip,
  onSatisfied,
}: {
  skip: boolean;
  onSatisfied: () => void;
}) => {
  useTokenRefreshUntil(TOKEN_FEATURE, {
    intervalMs: UNTIL_INTERVAL_MS,
    skip,
    onSatisfied,
  });

  return <div>Test</div>;
};

const settingsGets = () =>
  fetchMock.callHistory.calls("path:/api/session/properties").length;
const tokenRefreshPosts = () =>
  fetchMock.callHistory.calls("path:/api/premium-features/token/refresh")
    .length;

const advancePastInterval = async (intervals = 1) => {
  await act(async () => {
    jest.advanceTimersByTime(intervals * UNTIL_INTERVAL_MS + 100);
  });
};

const setupUntil = ({
  skip = false,
  /** Whether the *settings* payload already reports the awaited feature. */
  hasFeature = false,
  /** What the token refresh responds with, i.e. whether provisioning landed. */
  refreshFeatures = [] as TokenStatusFeature[],
  refreshFails = false,
}: {
  skip?: boolean;
  hasFeature?: boolean;
  refreshFeatures?: TokenStatusFeature[];
  refreshFails?: boolean;
} = {}) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "token-status": createMockTokenStatus({
        features: hasFeature ? [TOKEN_FEATURE] : [],
      }),
    }),
  );

  setupTokenRefreshEndpoint(
    refreshFails ? 500 : createMockTokenStatus({ features: refreshFeatures }),
  );

  const onSatisfied = jest.fn();

  const { rerender } = renderWithProviders(
    <UntilTestComponent skip={skip} onSatisfied={onSatisfied} />,
  );

  return {
    onSatisfied,
    setSkip: (nextSkip: boolean) =>
      rerender(
        <UntilTestComponent skip={nextSkip} onSatisfied={onSatisfied} />,
      ),
  };
};

describe("useTokenRefreshUntil", () => {
  describe("skip", () => {
    it("fetches nothing at all while skipped", async () => {
      // The storage flow mounts this app-wide and skips it until a purchase, so
      // a skipped hook has to be completely inert.
      setupUntil({ skip: true });

      await advancePastInterval(3);

      expect(settingsGets()).toBe(0);
      expect(tokenRefreshPosts()).toBe(0);
    });

    it("starts polling once it is no longer skipped", async () => {
      const { setSkip } = setupUntil({ skip: true });

      await advancePastInterval();
      expect(tokenRefreshPosts()).toBe(0);

      setSkip(false);

      await waitFor(() => {
        expect(settingsGets()).toBeGreaterThan(0);
      });
      await advancePastInterval();
      expect(tokenRefreshPosts()).toBeGreaterThan(0);
    });
  });

  describe("polling", () => {
    it("keeps refreshing the token while the feature is missing", async () => {
      setupUntil();

      await advancePastInterval();
      expect(tokenRefreshPosts()).toBe(1);

      await advancePastInterval();
      expect(tokenRefreshPosts()).toBeGreaterThan(1);
    });

    it("does not refresh at all once the token already has the feature", async () => {
      setupUntil({ hasFeature: true });

      await waitFor(() => {
        expect(settingsGets()).toBeGreaterThan(0);
      });
      await advancePastInterval(3);

      expect(tokenRefreshPosts()).toBe(0);
    });

    it("invalidates session properties when the refresh request succeeds", async () => {
      // The mutation's own `invalidatesTags` does this, not the hook. Pinned
      // because the hook only invalidates itself in the failure case.
      setupUntil();

      await waitFor(() => {
        expect(settingsGets()).toBeGreaterThan(0);
      });
      const getsBeforeRefresh = settingsGets();

      await advancePastInterval();
      expect(tokenRefreshPosts()).toBeGreaterThan(0);

      await waitFor(() => {
        expect(settingsGets()).toBeGreaterThan(getsBeforeRefresh);
      });
    });

    it("invalidates session properties even when the refresh request fails", async () => {
      // The `catch` invalidates so a failed refresh still lets the UI move on.
      setupUntil({ refreshFails: true });

      await waitFor(() => {
        expect(settingsGets()).toBeGreaterThan(0);
      });
      const getsBeforeRefresh = settingsGets();

      await advancePastInterval();
      expect(tokenRefreshPosts()).toBeGreaterThan(0);

      // The invalidation's refetch is a fresh request, so it needs retrying.
      await waitFor(() => {
        expect(settingsGets()).toBeGreaterThan(getsBeforeRefresh);
      });
    });
  });

  describe("onSatisfied", () => {
    it("fires once when the refresh reports the awaited feature", async () => {
      const { onSatisfied } = setupUntil({
        refreshFeatures: [TOKEN_FEATURE],
      });

      await advancePastInterval();
      expect(onSatisfied).toHaveBeenCalledTimes(1);

      // The loop keeps going, but the callback must not fire on every tick.
      await advancePastInterval(3);
      expect(onSatisfied).toHaveBeenCalledTimes(1);
    });

    it("does not fire while the refresh still lacks the feature", async () => {
      const { onSatisfied } = setupUntil();

      await advancePastInterval(2);
      expect(tokenRefreshPosts()).toBeGreaterThan(0);
      expect(onSatisfied).not.toHaveBeenCalled();
    });

    it("can fire again for a second run after being skipped", async () => {
      // Skipping resets the guard, so the next purchase gets its callback too.
      const { onSatisfied, setSkip } = setupUntil({
        refreshFeatures: [TOKEN_FEATURE],
      });

      await advancePastInterval();
      expect(onSatisfied).toHaveBeenCalledTimes(1);

      setSkip(true);
      await advancePastInterval();
      setSkip(false);

      await advancePastInterval();
      await waitFor(() => {
        expect(onSatisfied).toHaveBeenCalledTimes(2);
      });
    });
  });
});
