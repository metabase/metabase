import {
  DATA_APP_DIAGNOSTICS_CALL_LIMIT,
  DATA_APP_DIAGNOSTICS_LIMIT,
  DATA_APP_DIAGNOSTIC_MAX_CHARS,
} from "../constants/diagnostics-channel";
import type { DataAppDiagnosticEntry } from "../types/diagnostics-channel";

import { createDiagnosticsStore } from "./diagnostics-store";

const entry = (
  over: Partial<DataAppDiagnosticEntry> = {},
): DataAppDiagnosticEntry => ({
  time: 1700000000000,
  kind: "error",
  summary: "boom",
  detail: null,
  hint: null,
  alert: true,
  ...over,
});

const message = (entries: DataAppDiagnosticEntry[], sessionId = "page-1") => ({
  sessionId,
  entries,
  connection: null,
});

describe("createDiagnosticsStore", () => {
  it("stamps ids from one, so a poller can start at the beginning", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry({ summary: "first" })]));
    store.ingest(message([entry({ summary: "second" })]));

    expect(store.read(0).map((e) => [e.eventId, e.summary])).toEqual([
      [1, "first"],
      [2, "second"],
    ]);
    expect(store.nextEventId).toBe(3);
  });

  it("keeps ids climbing across a reload so a poller's cursor stays valid", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry({ summary: "old page" })], "page-1"));
    store.ingest(message([entry({ summary: "new page" })], "page-2"));

    // Restarting at 1 would put the new page's events *behind* a cursor that
    // already advanced, and the toolbar would look healthy while going blank.
    const [only] = store.read(0);
    expect(only.summary).toBe("new page");
    expect(only.eventId).toBe(2);
  });

  it("drops the previous page's events on a new session", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry({ summary: "before reload" })], "page-1"));
    store.ingest(message([entry({ summary: "after reload" })], "page-2"));

    expect(store.read(0).map((e) => e.summary)).toEqual(["after reload"]);
    expect(store.sessionId).toBe("page-2");
  });

  it("keeps events reported under the same session", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry({ summary: "one" })], "page-1"));
    store.ingest(message([entry({ summary: "two" })], "page-1"));

    expect(store.read(0)).toHaveLength(2);
  });

  it("adopts the first session without discarding what came with it", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry({ summary: "first ever" })], "page-1"));

    expect(store.read(0)).toHaveLength(1);
  });

  it("returns only what a cursor has not seen", () => {
    const store = createDiagnosticsStore();

    store.ingest(
      message([
        entry({ summary: "one" }),
        entry({ summary: "two" }),
        entry({ summary: "three" }),
      ]),
    );

    expect(store.read(3).map((e) => e.summary)).toEqual(["three"]);
    expect(store.read(store.nextEventId)).toEqual([]);
  });

  it("returns everything for a cursor that isn't a number", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry()]));

    // `?startEventId=abc` parses to NaN, and `eventId >= NaN` is false for
    // every entry — so without the guard a typo yields an empty feed, which
    // reads as "nothing is wrong". An absent param needs no guard: it parses
    // to 0, and every id is >= 0.
    expect(store.read(Number.NaN)).toHaveLength(1);
    expect(store.read(0)).toHaveLength(1);
  });

  it("re-caps oversized text, since the socket is just another local process", () => {
    const store = createDiagnosticsStore();
    const long = "x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS + 100);

    store.ingest(message([entry({ summary: long, detail: long })]));

    const [only] = store.read(0);
    expect(only.summary).toContain("truncated");
    expect(only.detail).toContain("truncated");
  });

  it("holds the last connection status reported, ignoring messages without one", () => {
    const store = createDiagnosticsStore();
    const connection = {
      checkedAt: 1,
      metabaseUrl: "http://localhost:3000",
      reachable: true,
      sdkVersion: "0.63.1",
    };

    store.ingest({ sessionId: "page-1", entries: [], connection });
    store.ingest(message([entry()]));

    expect(store.connection).toEqual(connection);
  });

  it("empties on clear, without rewinding the ids", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry(), entry()]));
    store.clear();
    store.ingest(message([entry({ summary: "after clear" })]));

    // Reusing an id a poller already consumed would hide the new entry.
    expect(store.read(0)).toEqual([
      expect.objectContaining({ eventId: 3, summary: "after clear" }),
    ]);
  });

  it("does not let a flood of requests evict the errors that explain them", () => {
    const store = createDiagnosticsStore();

    store.ingest(message([entry({ summary: "the error worth keeping" })]));
    store.ingest(
      message(
        Array.from({ length: DATA_APP_DIAGNOSTICS_LIMIT * 3 }, () =>
          entry({ kind: "sdk-call", summary: "GET /api/card/1 → 200" }),
        ),
      ),
    );

    const kept = store.read(0);
    expect(kept[0].summary).toBe("the error worth keeping");
    expect(kept.filter((e) => e.kind === "sdk-call")).toHaveLength(
      DATA_APP_DIAGNOSTICS_CALL_LIMIT,
    );
  });

  describe("reporting whether anything changed", () => {
    const connection = {
      checkedAt: 1,
      metabaseUrl: "http://localhost:3000",
      reachable: true,
      sdkVersion: "0.63.1",
    };

    it("is true for new entries", () => {
      const store = createDiagnosticsStore();

      expect(store.ingest(message([entry()]))).toBe(true);
    });

    it("is true for a new session", () => {
      const store = createDiagnosticsStore();
      store.ingest(message([entry()], "page-1"));

      expect(store.ingest(message([], "page-2"))).toBe(true);
    });

    it("is true when the connection check has re-run", () => {
      const store = createDiagnosticsStore();
      store.ingest({ sessionId: "page-1", entries: [], connection });

      expect(
        store.ingest({
          sessionId: "page-1",
          entries: [],
          connection: { ...connection, checkedAt: 2 },
        }),
      ).toBe(true);
    });

    it("is false for a flush that carries nothing new", () => {
      const store = createDiagnosticsStore();
      store.ingest({ sessionId: "page-1", entries: [entry()], connection });

      // The reporter flushes on a timer whether or not anything happened, and
      // the connection arrives as a fresh object every time — comparing it by
      // reference would call every flush a change and undo the whole point of
      // pushing instead of polling.
      expect(
        store.ingest({
          sessionId: "page-1",
          entries: [],
          connection: { ...connection },
        }),
      ).toBe(false);
    });
  });

  it("starts empty rather than pretending a page has reported", () => {
    const store = createDiagnosticsStore();

    expect(store.read(0)).toEqual([]);
    expect(store.sessionId).toBeNull();
    expect(store.connection).toBeNull();
    expect(store.lastReportAt).toBeNull();
    expect(store.nextEventId).toBe(1);
  });
});
