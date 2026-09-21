import type { devDiagnostics as DevDiagnostics } from "../components/DevToolbar/diagnostics";
import { DATA_APP_DIAGNOSTICS_URL } from "../constants/diagnostics-channel";
import type { DataAppDiagnosticsMessage } from "../types/diagnostics-channel";

const originalFetch = global.fetch;

const setup = () => {
  const sent: DataAppDiagnosticsMessage[] = [];
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchMock = jest.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      // The body is authored by the reporter under test, so it is a message.
      sent.push(JSON.parse(String(init?.body)) as DataAppDiagnosticsMessage);

      // The reporter only reads `ok` off the response.
      return { ok: true } as Response;
    },
  );

  // The mock covers the one overload the reporter calls.
  global.fetch = fetchMock as typeof fetch;

  let devDiagnostics!: typeof DevDiagnostics;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules offers no import() form
    const reporter = require("./diagnostics-reporter") as {
      installDiagnosticsReporter: () => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules offers no import() form
    const diagnostics = require("../components/DevToolbar/diagnostics") as {
      devDiagnostics: typeof DevDiagnostics;
    };
    devDiagnostics = diagnostics.devDiagnostics;

    reporter.installDiagnosticsReporter();
  });

  return { sent, requests, fetchMock, devDiagnostics };
};

const settle = () => jest.runOnlyPendingTimersAsync();

describe("installDiagnosticsReporter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("announces on install, so the server knows a client is alive", async () => {
    const { sent } = setup();
    await settle();

    expect(sent).toHaveLength(1);
    expect(sent[0].entries).toEqual([]);
  });

  it("POSTs JSON to the diagnostics endpoint", async () => {
    const { requests } = setup();
    await settle();

    expect(requests[0].url).toBe(DATA_APP_DIAGNOSTICS_URL);
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.headers).toEqual({
      "content-type": "application/json",
    });
  });

  it("sends the toolbar's summary, detail and hint rather than raw fields", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({
      kind: "csp-violation",
      directive: "connect-src",
      blockedUri: "https://api.example.com/v1",
    });
    await settle();

    const [entry] = sent[sent.length - 1].entries;
    expect(entry.kind).toBe("csp-violation");
    expect(entry.alert).toBe(true);
    expect(entry.hint).toMatch(/allowed_hosts in data_app.yaml/);
  });

  it("carries the allowed_hosts hint for a blocked request", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({
      kind: "blocked-network",
      api: "fetch",
      url: "https://api.example.com/v1/data",
      reason: "api.example.com (not in allowed_hosts)",
    });
    await settle();

    const [entry] = sent[sent.length - 1].entries;
    expect(entry.hint).toBe(
      "Add https://api.example.com to allowed_hosts in data_app.yaml (dev server restart required).",
    );
  });

  it("splits a stack into summary and detail", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({
      kind: "error",
      message: "TypeError: nope\n    at App (src/App.tsx:1:1)",
    });
    await settle();

    const [entry] = sent[sent.length - 1].entries;
    expect(entry.summary).toBe("TypeError: nope");
    expect(entry.detail).toBe("    at App (src/App.tsx:1:1)");
  });

  it("marks a failed SDK call as an alert but not a successful one", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({
      kind: "sdk-call",
      method: "POST",
      endpoint: "/api/dataset",
      status: 500,
      durationMs: 3,
    });
    devDiagnostics.record({
      kind: "sdk-call",
      method: "GET",
      endpoint: "/api/card/1",
      status: 200,
      durationMs: 3,
    });
    await settle();

    const { entries } = sent[sent.length - 1];
    expect(entries.map((entry) => entry.alert)).toEqual([true, false]);
  });

  it("batches a burst into one message and never re-sends an entry", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({ kind: "error", message: "one" });
    devDiagnostics.record({ kind: "error", message: "two" });
    await settle();

    expect(sent).toHaveLength(2);
    expect(sent[1].entries.map((entry) => entry.summary)).toEqual([
      "one",
      "two",
    ]);

    devDiagnostics.record({ kind: "error", message: "three" });
    await settle();

    expect(sent[2].entries.map((entry) => entry.summary)).toEqual(["three"]);
  });

  it("does not resend earlier entries after the toolbar's Clear", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({ kind: "error", message: "before clear" });
    await settle();

    devDiagnostics.clear();
    devDiagnostics.record({ kind: "error", message: "after clear" });
    await settle();

    const summaries = sent.at(-1)?.entries.map((entry) => entry.summary);
    expect(summaries).toEqual(["after clear"]);
  });

  it("keeps a batch the network dropped and delivers it on the retry", async () => {
    const { sent, fetchMock, devDiagnostics } = setup();
    await settle();
    const sentBefore = sent.length;

    // e.g. the dev server is restarting onto a changed .env.local
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    devDiagnostics.record({ kind: "error", message: "kept" });
    await settle();

    expect(sent).toHaveLength(sentBefore);

    // The retry timer re-flushes; the cursor never moved, so nothing was lost.
    await settle();
    expect(sent.at(-1)?.entries.map((entry) => entry.summary)).toEqual([
      "kept",
    ]);
  });

  it("treats a non-2xx response as undelivered and retries it", async () => {
    const { sent, fetchMock, devDiagnostics } = setup();
    await settle();

    // The reporter only reads `ok` off the response.
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    devDiagnostics.record({ kind: "error", message: "rejected then kept" });
    await settle();
    await settle();

    expect(sent.at(-1)?.entries.map((entry) => entry.summary)).toEqual([
      "rejected then kept",
    ]);
  });

  it("tags every message with a stable per-install sessionId", async () => {
    const { sent, devDiagnostics } = setup();
    await settle();

    devDiagnostics.record({ kind: "error", message: "one" });
    await settle();

    expect(typeof sent[0].sessionId).toBe("string");
    expect(sent[0].sessionId).not.toBe("");
    // Same page load → same sessionId on every message.
    expect(sent[sent.length - 1].sessionId).toBe(sent[0].sessionId);
  });
});
