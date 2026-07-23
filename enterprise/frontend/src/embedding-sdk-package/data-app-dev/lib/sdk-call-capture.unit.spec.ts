import {
  clearDevDiagnostics,
  getDevDiagnostics,
} from "../components/DevToolbar/diagnostics";
import { DATA_APP_DIAGNOSTIC_MAX_CHARS } from "../constants/diagnostics-channel";

import { truncateDiagnosticText } from "./diagnostics-limits";
import { installSdkCallCapture } from "./sdk-call-capture";

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

let realFetch: jest.Mock<Promise<Response>, []>;
let teardown: () => void;

const install = (metabaseUrl: string = METABASE_URL) => {
  realFetch = jest.fn(async () => jsonResponse({}));
  window.fetch = realFetch;
  teardown = installSdkCallCapture(metabaseUrl);
};

beforeEach(() => clearDevDiagnostics());
afterEach(() => teardown?.());

const calls = () =>
  getDevDiagnostics().filter((entry) => entry.kind === "sdk-call");

describe("installSdkCallCapture", () => {
  it("records a Metabase call and ignores everything else", async () => {
    install();

    await window.fetch(`${METABASE_URL}/api/card/1`);
    await window.fetch("https://example.com/thing");

    expect(calls()).toHaveLength(1);
    expect(calls()[0]).toMatchObject({ endpoint: "/api/card/1", status: 200 });
  });

  it("never buffers a successful response", async () => {
    install();
    // Reading a success body would download every query result — and every
    // export — twice, and there is nothing in it worth reporting.
    const exported = jsonResponse([{ a: 1 }]);
    const clone = jest.spyOn(exported, "clone");
    realFetch.mockResolvedValue(exported);

    await window.fetch(`${METABASE_URL}/api/dataset/json`);

    expect(clone).not.toHaveBeenCalled();
  });

  it("records the request method from init or a Request", async () => {
    install();

    await window.fetch(`${METABASE_URL}/api/card/1`, { method: "post" });
    expect(calls()[0].method).toBe("POST");

    await window.fetch(
      new Request(`${METABASE_URL}/api/card/2`, { method: "PUT" }),
    );
    expect(calls()[1].method).toBe("PUT");
  });

  it("reports why a request failed, not just that it did", async () => {
    install();
    realFetch.mockResolvedValue(
      errorResponse(400, { message: 'Table "orders" is not in the manifest' }),
    );

    await window.fetch(`${METABASE_URL}/api/dataset`);

    // The status alone leaves the author — and an agent reading the feed —
    // with "a query failed" and nowhere to go next.
    expect(calls()[0]).toMatchObject({
      status: 400,
      error: 'Table "orders" is not in the manifest',
    });
  });

  it("falls back to the raw body when the failure isn't a Metabase error", async () => {
    install();
    realFetch.mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    await window.fetch(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({
      status: 502,
      error: "<html>502 Bad Gateway</html>",
    });
  });

  it("records a failure with an empty body without inventing a reason", async () => {
    install();
    realFetch.mockResolvedValue(new Response("", { status: 500 }));

    await window.fetch(`${METABASE_URL}/api/dataset`);

    expect(calls()[0]).toMatchObject({ status: 500, error: undefined });
  });

  it("leaves the failure body readable by the caller", async () => {
    install();
    realFetch.mockResolvedValue(errorResponse(400, { message: "nope" }));

    const response = await window.fetch(`${METABASE_URL}/api/dataset`);

    // We read the body to report the reason. Reading the response itself rather
    // than a clone would leave the SDK's own error handling with a consumed
    // stream — every failure in the app would turn into a body-parse error.
    await expect(response.json()).resolves.toEqual({ message: "nope" });
  });

  it("caps a huge failure body exactly once", async () => {
    install();
    const message = "x".repeat(DATA_APP_DIAGNOSTIC_MAX_CHARS + 1000);
    realFetch.mockResolvedValue(errorResponse(400, { message }));

    await window.fetch(`${METABASE_URL}/api/dataset`);

    // Truncating here as well as in the store would re-truncate the already
    // capped string and chop up its own "… (truncated)" marker.
    const { error } = calls()[0];
    expect(error).toBe(truncateDiagnosticText(message));
    expect(error).toContain(`truncated, ${message.length} chars`);
  });

  it("keeps the querystring out of the recorded endpoint", async () => {
    install();

    await window.fetch(`${METABASE_URL}/api/card/1?token=secret&foo=bar`);

    // The feed is served over HTTP and read by tools outside the browser, so
    // anything credential-shaped in a query parameter must not reach it.
    expect(calls()[0].endpoint).toBe("/api/card/1");
    expect(JSON.stringify(calls()[0])).not.toContain("secret");
  });

  it("records the time the call took", async () => {
    install();

    await window.fetch(`${METABASE_URL}/api/card/1`);

    expect(calls()[0].durationMs).toEqual(expect.any(Number));
  });

  it("ignores an aborted request rather than reporting a failure", async () => {
    install();
    realFetch.mockRejectedValue(
      new DOMException("The user aborted a request.", "AbortError"),
    );

    await expect(window.fetch(`${METABASE_URL}/api/dataset`)).rejects.toThrow();

    // StrictMode remounts and superseded queries abort routinely; badging those
    // as errors trains the author to ignore the badge.
    expect(calls()).toHaveLength(0);
  });

  it("still reports a genuine transport failure", async () => {
    install();
    realFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(window.fetch(`${METABASE_URL}/api/dataset`)).rejects.toThrow();

    expect(calls()[0]).toMatchObject({
      status: null,
      error: "Failed to fetch",
    });
  });

  it("strips the base path of a sub-path deployment", async () => {
    install("https://acme.com/metabase");

    await window.fetch("https://acme.com/metabase/api/dataset");

    // Without stripping, every endpoint reads `/metabase/api/...`, which matches
    // neither the paths the author knows nor the ones in the Metabase docs.
    expect(calls()[0]).toMatchObject({ endpoint: "/api/dataset" });
  });

  it("passes through a same-origin call that sits outside the base path", async () => {
    install("https://acme.com/metabase");

    // Another app on the same host is not the Metabase deployment; recording it
    // would put a tenant's unrelated traffic into the data-app author's feed.
    await window.fetch("https://acme.com/other-app/api/dataset");

    expect(calls()).toHaveLength(0);
  });

  it("does nothing without a Metabase URL to watch", async () => {
    const untouched = jest.fn(async () => jsonResponse({}));
    window.fetch = untouched;

    const teardownNoop = installSdkCallCapture(undefined);
    await window.fetch(`${METABASE_URL}/api/card/1`);
    teardownNoop();

    expect(window.fetch).toBe(untouched);
    expect(calls()).toHaveLength(0);
  });

  it("does nothing when the Metabase URL cannot be parsed", async () => {
    const untouched = jest.fn(async () => jsonResponse({}));
    window.fetch = untouched;

    const teardownNoop = installSdkCallCapture("not-a-url");
    await window.fetch(`${METABASE_URL}/api/card/1`);
    teardownNoop();

    expect(window.fetch).toBe(untouched);
    expect(calls()).toHaveLength(0);
  });

  it("stops recording once torn down, and can be reinstalled without double-counting", async () => {
    install();
    teardown();

    await window.fetch(`${METABASE_URL}/api/card/1`);
    expect(calls()).toHaveLength(0);

    // Reinstalling wraps the restored fetch, not the previous wrapper — without
    // the teardown resetting `installed`, a remount would record every call twice.
    teardown = installSdkCallCapture(METABASE_URL);
    await window.fetch(`${METABASE_URL}/api/card/1`);

    expect(calls()).toHaveLength(1);
  });
});
