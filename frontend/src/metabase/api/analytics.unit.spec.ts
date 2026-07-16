import type { SearchRequest, SearchResponse } from "metabase-types/api";
import { createMockSearchResults } from "metabase-types/api/mocks";

import { registerSearchStarted, trackFulfilledSearch } from "./analytics";

jest.mock("metabase/analytics", () => ({
  trackSchemaEvent: jest.fn(),
  trackSimpleEvent: jest.fn(),
}));

// Reached through requireMock rather than a top-level import: the analytics-import lint rule forbids
// importing `trackSchemaEvent` outside analytics files.
const { trackSchemaEvent: mockTrackSchemaEvent } = jest.requireMock<{
  trackSchemaEvent: jest.Mock;
}>("metabase/analytics");

// Avoid crypto.subtle / Settings in the hashing path; we only care about the tracking lifecycle here.
jest.mock("metabase/common/search/term", () => ({
  hashSearchTerm: jest.fn(async () => "hashed"),
  shouldReportSearchTerm: jest.fn(() => false),
}));

// Past the 300ms debounce window (see DOCUMENT_SEARCH_TRACK_DEBOUNCE_MS in analytics.ts).
const SETTLE_WAIT_MS = 350;

// jest's modern fake timers (@sinonjs) install a `clock` property on the replaced global timers;
// real timers have none. That distinguishes the fast-test regime from a stock (real-timer) run.
const usingFakeTimers = () =>
  Object.prototype.hasOwnProperty.call(setTimeout, "clock");

const makeRequest = (
  overrides: Partial<SearchRequest> = {},
): SearchRequest => ({
  q: "orders",
  context: "search-bar",
  ...overrides,
});

const makeResponse = (): SearchResponse => createMockSearchResults();

// Under the fast-test fake-timer regime, both underscore's captured `Date.now` and `setTimeout` are
// faked (and thus consistent), so advancing the fake clock settles the debounce. On real timers we
// actually wait. `_.debounce` reads `now()` and `setTimeout` from the same clock either way.
const wait = (ms: number) =>
  usingFakeTimers()
    ? jest.advanceTimersByTimeAsync(ms)
    : new Promise((resolve) => setTimeout(resolve, ms));

// trackSearchRequest awaits hashSearchTerm before it fires, so let the microtask queue drain.
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe("trackFulfilledSearch", () => {
  afterEach(async () => {
    // Let any queued debounce settle so it can't fire into the next test, then reset call counts.
    await wait(SETTLE_WAIT_MS);
    jest.clearAllMocks();
  });

  it("tracks a non-document search immediately", async () => {
    trackFulfilledSearch(makeRequest(), makeResponse(), 10, "req-1");

    await flushMicrotasks();

    expect(mockTrackSchemaEvent).toHaveBeenCalledTimes(1);
  });

  it("skips a query-less request (whitespace or absent)", async () => {
    trackFulfilledSearch(
      makeRequest({ q: "   " }),
      makeResponse(),
      10,
      "req-1",
    );
    trackFulfilledSearch(
      makeRequest({ q: undefined }),
      makeResponse(),
      10,
      "req-2",
    );

    await flushMicrotasks();

    expect(mockTrackSchemaEvent).not.toHaveBeenCalled();
  });

  it("debounces a document search until the settle window elapses", async () => {
    const request = makeRequest({ context: "document" });
    registerSearchStarted(request, "req-1");
    trackFulfilledSearch(request, makeResponse(), 10, "req-1");

    await flushMicrotasks();
    expect(mockTrackSchemaEvent).not.toHaveBeenCalled();

    await wait(SETTLE_WAIT_MS);
    await flushMicrotasks();
    expect(mockTrackSchemaEvent).toHaveBeenCalledTimes(1);
  });

  it("collapses multiple document searches within the window into one event", async () => {
    const request = makeRequest({ context: "document" });

    registerSearchStarted(request, "req-1");
    trackFulfilledSearch(request, makeResponse(), 10, "req-1");

    await wait(100);

    registerSearchStarted(request, "req-2");
    trackFulfilledSearch(request, makeResponse(), 10, "req-2");

    await wait(SETTLE_WAIT_MS);
    await flushMicrotasks();

    expect(mockTrackSchemaEvent).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale response without dropping the latest queued event (schedule-time guard)", async () => {
    const request = makeRequest({ context: "document" });

    // The latest request req-2 fulfills and queues its event.
    registerSearchStarted(request, "req-2");
    trackFulfilledSearch(request, makeResponse(), 10, "req-2");

    // A stale older response arrives before the debounce fires. The schedule-time guard must drop it
    // so it can't overwrite the queued req-2 args — otherwise the fire-time guard would then suppress
    // the overwritten event and lose the legitimate req-2 one entirely.
    trackFulfilledSearch(request, makeResponse(), 10, "req-1");

    await wait(SETTLE_WAIT_MS);
    await flushMicrotasks();

    expect(mockTrackSchemaEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSchemaEvent).toHaveBeenCalledWith(
      "search",
      expect.objectContaining({ request_id: "req-2" }),
    );
  });

  it("suppresses a queued event when a newer document request starts before it fires (fire-time guard)", async () => {
    const request = makeRequest({ context: "document" });

    registerSearchStarted(request, "req-1");
    trackFulfilledSearch(request, makeResponse(), 10, "req-1");

    // A newer request starts inside the debounce window but never fulfills; the queued req-1 event
    // must be dropped at fire time even though it passed the schedule-time check.
    await wait(100);
    registerSearchStarted(request, "req-2");

    await wait(SETTLE_WAIT_MS);
    await flushMicrotasks();

    expect(mockTrackSchemaEvent).not.toHaveBeenCalled();
  });
});
