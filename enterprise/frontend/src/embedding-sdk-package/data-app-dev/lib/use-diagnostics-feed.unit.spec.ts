import { act, renderHook, waitFor } from "@testing-library/react";

import { DATA_APP_DIAGNOSTICS_LIMIT } from "../constants/diagnostics-channel";
import type {
  DataAppDiagnosticPayload,
  DataAppDiagnosticsReport,
} from "../types/diagnostics-channel";

import { useDiagnosticsFeed } from "./use-diagnostics-feed";

const entry = (eventId: number): DataAppDiagnosticPayload => ({
  eventId,
  time: 0,
  kind: "error",
  summary: `event ${eventId}`,
  detail: null,
  hint: null,
  alert: true,
});

const report = (
  entries: DataAppDiagnosticPayload[],
  sessionId: string | null = "page-1",
): DataAppDiagnosticsReport => ({
  entries,
  connection: null,
  manifest: null,
  clients: 1,
  lastReportAt: 1,
  lastRebuildAt: 1,
  nextEventId: (entries.at(-1)?.eventId ?? 0) + 1,
  sessionId,
});

const ok = (body: DataAppDiagnosticsReport) =>
  new Response(JSON.stringify(body), { status: 200 });

/**
 * A stub that filters by `startEventId` exactly as the dev server does, so a
 * poll never re-delivers what the caller already has. Modelling the real
 * contract keeps these tests from passing (or failing) on timing.
 */
const serveBuffer =
  (buffer: DataAppDiagnosticPayload[], sessionId: string | null = "page-1") =>
  (url: string) => {
    const startEventId = Number(
      new URL(url, "http://localhost").searchParams.get("startEventId"),
    );
    const entries = buffer.filter((item) => item.eventId >= startEventId);

    return ok({ ...report(buffer, sessionId), entries });
  };

afterEach(() => jest.restoreAllMocks());

describe("useDiagnosticsFeed", () => {
  it("does not append the same batch twice when polls overlap", async () => {
    // A rebuild blocks the dev server, so a poll can outlive its interval tick.
    let release: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });

    const serve = serveBuffer([entry(1)]);
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pending)
      .mockImplementation((url) => Promise.resolve(serve(String(url))));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10));

    // Let several interval ticks fire while the first read is still in flight.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // The guard means those ticks were dropped, not queued behind the same cursor.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(serve(`/feed?startEventId=0`));
      await pending;
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it("keeps at most the server's buffer size", async () => {
    const overflowing = Array.from(
      { length: DATA_APP_DIAGNOSTICS_LIMIT + 25 },
      (_, index) => entry(index + 1),
    );
    const serve = serveBuffer(overflowing);
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) => Promise.resolve(serve(String(url))));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10));

    await waitFor(() =>
      expect(result.current.entries).toHaveLength(DATA_APP_DIAGNOSTICS_LIMIT),
    );
    // The newest survive, the oldest are dropped.
    expect(result.current.entries.at(-1)?.eventId).toBe(overflowing.length);
  });

  it("discards a response that was in flight when the feed was cleared", async () => {
    let release: (value: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });

    jest
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pending)
      .mockResolvedValue(ok(report([])));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10_000));

    act(() => result.current.clear());

    await act(async () => {
      release(ok(report([entry(1), entry(2)])));
      await pending;
    });

    // Those two were fetched before the clear; showing them would resurrect
    // exactly what the user asked to remove.
    expect(result.current.entries).toEqual([]);
  });

  it("distinguishes a refused response from an unreachable server", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10_000));

    await waitFor(() =>
      expect(result.current.problem).toEqual({ kind: "http", status: 500 }),
    );

    fetchSpy.mockRejectedValue(new Error("connection refused"));
    const { result: offline } = renderHook(() =>
      useDiagnosticsFeed("/feed", 10_000),
    );

    await waitFor(() =>
      expect(offline.current.problem).toEqual({ kind: "unreachable" }),
    );
  });

  it("reports `loaded` only once a response has landed", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(ok(report([])));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10_000));

    // Before the first response, `clients: 0` is an absence of data, not a fact.
    expect(result.current.loaded).toBe(false);

    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("recovers when the dev server restarts and its ids begin again", async () => {
    const before = serveBuffer([entry(500), entry(501)]);
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) => Promise.resolve(before(String(url))));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10));
    await waitFor(() => expect(result.current.entries).toHaveLength(2));

    // Restarted: the buffer is fresh and ids begin at 1 again. Keeping the old
    // cursor would filter out every new event forever, leaving a feed that looks
    // healthy and is permanently empty — and old ids would collide with new ones.
    const after = serveBuffer([entry(1)]);
    fetchSpy.mockImplementation((url) => Promise.resolve(after(String(url))));

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].eventId).toBe(1);
    });
  });

  it("drops accumulated entries when the page changes under it", async () => {
    // A fresh toolbar can read the old buffer before the new reporter clears it
    // server-side; a changed sessionId is the signal to reset.
    const before = serveBuffer([entry(1)], "page-1");
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) => Promise.resolve(before(String(url))));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", 10));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const after = serveBuffer([entry(2)], "page-2");
    fetchSpy.mockImplementation((url) => Promise.resolve(after(String(url))));

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].eventId).toBe(2);
    });
  });

  describe("when the dev server can nudge it", () => {
    const makeSubscribe = () => {
      const listeners = new Set<() => void>();

      return {
        subscribe: (onChange: () => void) => {
          listeners.add(onChange);

          return () => listeners.delete(onChange);
        },
        nudge: () => listeners.forEach((listener) => listener()),
        get listenerCount() {
          return listeners.size;
        },
      };
    };

    it("re-reads on a nudge instead of waiting for the next heartbeat", async () => {
      const { subscribe, nudge } = makeSubscribe();
      const buffer = [entry(1)];
      const serve = serveBuffer(buffer);
      jest
        .spyOn(globalThis, "fetch")
        .mockImplementation((url) => Promise.resolve(serve(String(url))));

      const { result } = renderHook(() =>
        useDiagnosticsFeed("/feed", 60_000, subscribe),
      );
      await waitFor(() => expect(result.current.entries).toHaveLength(1));

      buffer.push(entry(2));
      await act(async () => {
        nudge();
      });

      // The heartbeat is a minute out; without the nudge this would still show
      // one entry, which is the whole reason for pushing rather than polling.
      await waitFor(() => expect(result.current.entries).toHaveLength(2));
    });

    it("stops listening when unmounted", () => {
      const socket = makeSubscribe();
      jest
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(ok(report([]))));

      const { unmount } = renderHook(() =>
        useDiagnosticsFeed("/feed", 60_000, socket.subscribe),
      );
      expect(socket.listenerCount).toBe(1);

      unmount();

      // A toolbar that unmounts without unsubscribing keeps re-reading the feed
      // for the rest of the session, once per nudge, forever.
      expect(socket.listenerCount).toBe(0);
    });
  });
});
