import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import { DATA_APP_DIAGNOSTIC_MAX_CHARS } from "../constants/diagnostics-channel";

import { truncateDiagnosticText } from "./diagnostics-limits";
import { sdkCallCapture } from "./sdk-call-capture";

const METABASE_URL = "http://localhost:3000";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const errorResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const realFetch = window.fetch;

let originalFetch: jest.Mock<Promise<Response>, []>;

const setup = (metabaseUrl: string = METABASE_URL) => {
  originalFetch = jest.fn(async () => jsonResponse({}));
  window.fetch = originalFetch;
  sdkCallCapture.install(metabaseUrl);
};

// The capture records off the critical path (the app gets its response first),
// so let the background read settle before asserting on what was recorded.
const call = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await window.fetch(input, init);
  await new Promise((resolve) => setTimeout(resolve));

  return response;
};

const calls = () =>
  devDiagnostics.getEntries().filter((entry) => entry.kind === "sdk-call");

describe("SdkCallCapture", () => {
  beforeEach(() => devDiagnostics.clear());
  afterEach(() => {
    window.fetch = realFetch;
  });

  it("records a Metabase call and ignores everything else", async () => {
    setup();

    await call(`${METABASE_URL}/api/card/1`);
    await call("https://example.com/thing");

    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatchObject({ endpoint: "/api/card/1", status: 200 });
  });

  it("reads a successful response through a clone, never the original", async () => {
    setup();
    // A 2xx is inspected for a reported failure, so the original body has to be
    // left untouched for the caller.
    const exported = jsonResponse([{ a: 1 }]);
    const clone = jest.spyOn(exported, "clone");
    originalFetch.mockResolvedValue(exported);

    await call(`${METABASE_URL}/api/dataset/json`);

    expect(clone).toHaveBeenCalled();
    expect(exported.bodyUsed).toBe(false);
  });

  it("records the request method from init or a Request", async () => {
    setup();

    await call(`${METABASE_URL}/api/card/1`, { method: "post" });
    expect(calls()[0].method).toBe("POST");

    await call(new Request(`${METABASE_URL}/api/card/2`, { method: "PUT" }));
    expect(calls()[1].method).toBe("PUT");
  });

  it("reports why a request failed, not just that it did", async () => {
    setup();
    originalFetch.mockResolvedValue(
      errorResponse(400, { message: 'Table "orders" is not in the manifest' }),
    );

    await call(`${METABASE_URL}/api/dataset`);

    // The status alone leaves the author — and an agent reading the feed —
    // with "a query failed" and nowhere to go next.
    expect(calls()[0]).toMatchObject({
      status: 400,
      error: 'Table "orders" is not in the manifest',
    });
  });

  it("falls back to the raw body when the failure isn't a Metabase error", async () => {
    setup();
    originalFetch.mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    await call(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({
      status: 502,
      error: "<html>502 Bad Gateway</html>",
    });
  });

  it("reports a query that failed inside a 2xx, which the status alone hides", async () => {
    setup();
    originalFetch.mockResolvedValue(
      jsonResponse({ status: "failed", error: "Table does not exist" }),
    );

    await call(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({
      status: 200,
      error: "Table does not exist",
    });
  });

  it("names a 2xx failure that carries no reason", async () => {
    setup();
    originalFetch.mockResolvedValue(jsonResponse({ status: "failed" }));

    await call(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({ status: 200, error: "Query failed" });
  });

  it("leaves a completed result alone", async () => {
    setup();
    originalFetch.mockResolvedValue(
      jsonResponse({ status: "completed", data: { rows: [[1]] } }),
    );

    await call(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({ status: 200, error: undefined });
  });

  it("gives up on a result too large to be an error", async () => {
    setup();
    // Reading it whole would pull the entire result into memory just to learn
    // it is not a failure map.
    originalFetch.mockResolvedValue(
      jsonResponse({ status: "failed", pad: "x".repeat(200 * 1024) }),
    );

    await call(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({ status: 200, error: undefined });
  });

  it("leaves a 2xx body readable by the caller", async () => {
    setup();
    originalFetch.mockResolvedValue(
      jsonResponse({ status: "completed", rows: 1 }),
    );

    const response = await call(`${METABASE_URL}/api/dataset`);

    expect(await response.json()).toEqual({ status: "completed", rows: 1 });
  });

  it("records a failure with an empty body without inventing a reason", async () => {
    setup();
    originalFetch.mockResolvedValue(new Response("", { status: 500 }));

    await call(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({ status: 500, error: undefined });
  });

  it("leaves the failure body readable by the caller", async () => {
    setup();
    originalFetch.mockResolvedValue(errorResponse(400, { message: "nope" }));

    const response = await call(`${METABASE_URL}/api/dataset`);

    // We read the body to report the reason. Reading the response itself rather
    // than a clone would leave the SDK's own error handling with a consumed
    // stream — every failure in the app would turn into a body-parse error.
    await expect(response.json()).resolves.toEqual({ message: "nope" });
  });

  it("truncates a huge failure body exactly once", async () => {
    setup();
    const message = "x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS + 1000);
    originalFetch.mockResolvedValue(errorResponse(400, { message }));

    await call(`${METABASE_URL}/api/dataset`);

    // Truncating here as well as in the collector would re-truncate the already
    // truncated string and chop up its own "… (truncated)" marker.
    const { error } = calls()[0];
    expect(error).toBe(truncateDiagnosticText(message));
    expect(error).toContain(`truncated, ${message.length} chars`);
  });

  it("reports a large error body, truncated, rather than losing the reason", async () => {
    setup();
    // Unlike a 2xx result, an error is read whatever its size — the reason is at
    // the front, and `record` truncates what we keep.
    originalFetch.mockResolvedValue(
      new Response("x".repeat(200 * 1024), { status: 502 }),
    );

    await call(`${METABASE_URL}/api/dataset`);

    const { status, error } = calls()[0];
    expect(status).toBe(502);
    expect(error).toContain("truncated");
  });

  it("keeps the querystring out of the recorded endpoint", async () => {
    setup();

    await call(`${METABASE_URL}/api/card/1?token=secret&foo=bar`);

    // The feed is served over HTTP and read by tools outside the browser, so
    // anything credential-shaped in a query parameter must not reach it.
    expect(calls()[0].endpoint).toBe("/api/card/1");
    expect(JSON.stringify(calls()[0])).not.toContain("secret");
  });

  it("records the time the call took", async () => {
    setup();

    await call(`${METABASE_URL}/api/card/1`);

    expect(calls()[0].durationMs).toEqual(expect.any(Number));
  });

  it("ignores an aborted request rather than reporting a failure", async () => {
    setup();
    originalFetch.mockRejectedValue(
      new DOMException("The user aborted a request.", "AbortError"),
    );

    await expect(window.fetch(`${METABASE_URL}/api/dataset`)).rejects.toThrow();

    // StrictMode remounts and superseded queries abort routinely; badging those
    // as errors trains the author to ignore the badge.
    expect(calls()).toHaveLength(0);
  });

  it("still reports a genuine transport failure", async () => {
    setup();
    originalFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(window.fetch(`${METABASE_URL}/api/dataset`)).rejects.toThrow();

    expect(calls()[0]).toMatchObject({
      status: null,
      error: "Failed to fetch",
    });
  });

  it("strips the base path of a sub-path deployment", async () => {
    setup("https://acme.com/metabase");

    await call("https://acme.com/metabase/api/dataset");

    // Without stripping, every endpoint reads `/metabase/api/...`, which matches
    // neither the paths the author knows nor the ones in the Metabase docs.
    expect(calls()[0]).toMatchObject({ endpoint: "/api/dataset" });
  });

  it("passes through a same-origin call that sits outside the base path", async () => {
    setup("https://acme.com/metabase");

    // Another app on the same host is not the Metabase deployment; recording it
    // would put a tenant's unrelated traffic into the data-app author's feed.
    await call("https://acme.com/other-app/api/dataset");

    expect(calls()).toHaveLength(0);
  });

  it("does nothing without a Metabase URL to watch", async () => {
    const untouched = jest.fn(async () => jsonResponse({}));
    window.fetch = untouched;

    sdkCallCapture.install(undefined);
    await call(`${METABASE_URL}/api/card/1`);

    // `fetch` is left alone, so nothing is recorded.
    expect(window.fetch).toBe(untouched);
    expect(calls()).toHaveLength(0);
  });

  it("does nothing when the Metabase URL cannot be parsed", async () => {
    const untouched = jest.fn(async () => jsonResponse({}));
    window.fetch = untouched;

    sdkCallCapture.install("not-a-url");
    await call(`${METABASE_URL}/api/card/1`);

    expect(window.fetch).toBe(untouched);
    expect(calls()).toHaveLength(0);
  });
});
