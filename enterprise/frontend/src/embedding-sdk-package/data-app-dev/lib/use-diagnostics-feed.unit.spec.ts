import { act, renderHook, waitFor } from "@testing-library/react";

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
): DataAppDiagnosticsReport => ({
  entries,
  connection: null,
  manifest: null,
  clients: 1,
  lastReportAt: 1,
  lastRebuildAt: 1,
  nextEventId: (entries.at(-1)?.eventId ?? 0) + 1,
  sessionId: "page-1",
});

const ok = (body: DataAppDiagnosticsReport) =>
  new Response(JSON.stringify(body), { status: 200 });

/** The dev server's "feed changed" socket, in the shape the hook subscribes to. */
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

afterEach(() => jest.restoreAllMocks());

describe("useDiagnosticsFeed", () => {
  it("mirrors the endpoint's report on mount", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(ok(report([entry(1), entry(2)])));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed"));

    await waitFor(() =>
      expect(result.current.entries.map((e) => e.eventId)).toEqual([1, 2]),
    );
  });

  it("re-reads and re-mirrors on a nudge", async () => {
    const { subscribe, nudge } = makeSubscribe();
    let current = report([entry(1)]);
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(ok(current)));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", subscribe));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // The server buffer changed — a restart or a reload just means a different
    // report, which the next read mirrors wholesale. No cursor, no stitching.
    current = report([entry(1), entry(2)]);
    await act(async () => nudge());

    await waitFor(() =>
      expect(result.current.entries.map((e) => e.eventId)).toEqual([1, 2]),
    );
  });

  it("does not let a slow read overwrite a fresher one", async () => {
    const { subscribe, nudge } = makeSubscribe();

    let releaseStale: (value: Response) => void = () => undefined;
    const stale = new Promise<Response>((resolve) => {
      releaseStale = resolve;
    });

    jest
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(stale) // the mount read, left hanging
      .mockResolvedValue(ok(report([entry(9)]))); // the nudge read, resolves first

    const { result } = renderHook(() => useDiagnosticsFeed("/feed", subscribe));
    await act(async () => nudge());
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    // The mount read finally lands, carrying older data. It must be dropped, not
    // painted over the newer report the nudge already delivered.
    await act(async () => {
      releaseStale(ok(report([entry(1), entry(2), entry(3)])));
      await stale;
    });

    expect(result.current.entries.map((e) => e.eventId)).toEqual([9]);
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

    const { result } = renderHook(() => useDiagnosticsFeed("/feed"));

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

    const { result } = renderHook(() => useDiagnosticsFeed("/feed"));

    await waitFor(() =>
      expect(result.current.problem).toEqual({ kind: "http", status: 500 }),
    );

    fetchSpy.mockRejectedValue(new Error("connection refused"));
    const { result: offline } = renderHook(() => useDiagnosticsFeed("/feed"));

    await waitFor(() =>
      expect(offline.current.problem).toEqual({ kind: "unreachable" }),
    );
  });

  it("reports `loaded` only once a response has landed", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(ok(report([])));

    const { result } = renderHook(() => useDiagnosticsFeed("/feed"));

    // Before the first response, `clients: 0` is an absence of data, not a fact.
    expect(result.current.loaded).toBe(false);

    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("stops listening when unmounted", () => {
    const socket = makeSubscribe();
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(ok(report([]))));

    const { unmount } = renderHook(() =>
      useDiagnosticsFeed("/feed", socket.subscribe),
    );
    expect(socket.listenerCount).toBe(1);

    unmount();

    // A toolbar that unmounts without unsubscribing keeps re-reading the feed
    // for the rest of the session, once per nudge, forever.
    expect(socket.listenerCount).toBe(0);
  });
});
