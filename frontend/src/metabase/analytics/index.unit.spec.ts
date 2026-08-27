const mockTrackers = {
  createSnowplowTracker: jest.fn(),
  initMetaplow: jest.fn(),
  trackPageView: jest.fn(),
  trackSchemaEvent: jest.fn(),
  trackSimpleEvent: jest.fn(),
};

const mockSettings = {
  snowplowEnabled: jest.fn().mockReturnValue(false),
  get: jest.fn().mockReturnValue(undefined),
};

// `frontend/test/__support__/mocks.js` mocks this module for every other spec.
jest.unmock("metabase/analytics");
jest.mock("./trackers", () => mockTrackers);
jest.mock("metabase/utils/settings", () => ({
  __esModule: true,
  default: mockSettings,
}));

const settleTrackerLoad = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

// jsdom has no requestIdleCallback, and the fallback would hold every test for
// its delay. Run the callback as soon as it is scheduled instead.
beforeEach(() => {
  window.requestIdleCallback = (callback) => {
    callback({ didTimeout: false, timeRemaining: () => 0 });
    return 0;
  };
});

const EVENT = { event: "csv_download_clicked" };

function setup({ snowplowEnabled = false, metaplowUrl = "" } = {}) {
  jest.resetModules();
  jest.clearAllMocks();
  mockSettings.snowplowEnabled.mockReturnValue(snowplowEnabled);
  mockSettings.get.mockImplementation((key: string) =>
    key === "metaplow-url" ? metaplowUrl : undefined,
  );
  return import("./index");
}

describe("analytics", () => {
  it("sends an event recorded before the trackers load", async () => {
    const { initAnalytics, trackSimpleEvent } = await setup({
      snowplowEnabled: true,
    });

    initAnalytics({ getUserId: () => 1 });
    trackSimpleEvent(EVENT);
    expect(mockTrackers.trackSimpleEvent).not.toHaveBeenCalled();

    await settleTrackerLoad();
    expect(mockTrackers.trackSimpleEvent).toHaveBeenCalledWith(EVENT);
  });

  it("sends an event recorded after the trackers load", async () => {
    const { initAnalytics, trackSimpleEvent } = await setup({
      snowplowEnabled: true,
    });

    initAnalytics({ getUserId: () => 1 });
    await settleTrackerLoad();
    trackSimpleEvent(EVENT);

    expect(mockTrackers.trackSimpleEvent).toHaveBeenCalledWith(EVENT);
  });

  it("starts snowplow alone for an entry that asks for it", async () => {
    const { startSnowplowTracker, trackSimpleEvent } = await setup({
      snowplowEnabled: true,
    });

    startSnowplowTracker(() => 7);
    trackSimpleEvent(EVENT);
    await settleTrackerLoad();

    expect(mockTrackers.createSnowplowTracker).toHaveBeenCalledTimes(1);
    expect(mockTrackers.initMetaplow).not.toHaveBeenCalled();
    expect(mockTrackers.trackSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it("starts the trackers once, whatever the number of events", async () => {
    const { initAnalytics, trackPageView, trackSimpleEvent } = await setup({
      snowplowEnabled: true,
    });

    initAnalytics({ getUserId: () => 1 });
    trackPageView("/question/1");
    trackSimpleEvent(EVENT);
    await settleTrackerLoad();

    expect(mockTrackers.createSnowplowTracker).toHaveBeenCalledTimes(1);
    expect(mockTrackers.initMetaplow).toHaveBeenCalledTimes(1);
    expect(mockTrackers.trackPageView).toHaveBeenCalledWith("/question/1");
    expect(mockTrackers.trackSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it("gives the trackers the current user", async () => {
    const { initAnalytics, trackSimpleEvent } = await setup({
      snowplowEnabled: true,
    });

    initAnalytics({ getUserId: () => 42 });
    trackSimpleEvent(EVENT);
    await settleTrackerLoad();

    const [getUserId] = mockTrackers.createSnowplowTracker.mock.calls[0];
    expect(getUserId()).toBe(42);
  });

  it("loads nothing when the instance reports to no collector", async () => {
    const { initAnalytics, trackSimpleEvent } = await setup();

    initAnalytics({ getUserId: () => 1 });
    trackSimpleEvent(EVENT);
    await settleTrackerLoad();

    expect(mockTrackers.createSnowplowTracker).not.toHaveBeenCalled();
    expect(mockTrackers.trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("reports to metaplow even when snowplow is off", async () => {
    const { initAnalytics, trackSimpleEvent } = await setup({
      metaplowUrl: "https://example.com/send",
    });

    initAnalytics({ getUserId: () => 1 });
    trackSimpleEvent(EVENT);
    await settleTrackerLoad();

    expect(mockTrackers.trackSimpleEvent).toHaveBeenCalledTimes(1);
  });
});
