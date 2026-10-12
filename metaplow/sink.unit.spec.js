const http = require("node:http");

const { createSink } = require("./sink");

const listen = (sink) =>
  new Promise((resolve) => {
    sink.listen(0, "127.0.0.1", () => resolve(sink.address().port));
  });

const closeSink = (sink) => new Promise((resolve) => sink.close(resolve));

/** Minimal `node:http` client so these tests do not depend on a global `fetch`. */
const request = (port, { method = "GET", path = "/", body, headers = {} }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, text }),
        );
      },
    );
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });

const post = (port, payload, path = "/api/send") =>
  request(port, {
    method: "POST",
    path,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });

const recorded = async (port) => {
  const { status, text } = await request(port, { path: "/sink/events" });
  expect(status).toBe(200);
  return JSON.parse(text);
};

const eventPayload = (name) => ({ type: "event", payload: { name } });

describe("metaplow sink", () => {
  let sink;
  let port;

  const start = async (options) => {
    sink = createSink(options);
    port = await listen(sink);
    return port;
  };

  afterEach(async () => {
    if (sink) {
      await closeSink(sink);
      sink = undefined;
    }
  });

  it("records a posted event and exposes it", async () => {
    await start();

    await post(port, eventPayload("dashboard.dashboard_created"));

    const events = await recorded(port);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      path: "/api/send",
      body: { type: "event", payload: { name: "dashboard.dashboard_created" } },
    });
    expect(typeof events[0].receivedAt).toBe("string");
  });

  it("answers a post with a JSON body the tracker can parse without disabling itself", async () => {
    await start();

    const { status, headers, text } = await post(
      port,
      eventPayload("pageview"),
    );

    expect(status).toBe(200);
    expect(headers["content-type"]).toMatch(/application\/json/);
    expect(JSON.parse(text).disabled).toBeFalsy();
  });

  it("keeps posts in arrival order", async () => {
    await start();

    await post(port, eventPayload("first"));
    await post(port, eventPayload("second"));

    const events = await recorded(port);
    expect(events.map((e) => e.body.payload.name)).toEqual(["first", "second"]);
  });

  it("clears what it recorded on reset", async () => {
    await start();
    await post(port, eventPayload("pageview"));

    const { status } = await request(port, { path: "/sink/reset" });

    expect(status).toBe(200);
    expect(await recorded(port)).toEqual([]);
  });

  it("does not record its own control requests", async () => {
    await start();

    await request(port, { path: "/sink/reset" });
    await request(port, { path: "/sink/events" });

    expect(await recorded(port)).toEqual([]);
  });

  it("records a post to any path, so a misconfigured collector URL is still visible", async () => {
    await start();

    await post(port, eventPayload("pageview"), "/somewhere/else");

    expect(await recorded(port)).toMatchObject([{ path: "/somewhere/else" }]);
  });

  it("records a body that is not JSON as raw text rather than failing", async () => {
    await start();

    const { status } = await post(port, "not json at all");

    expect(status).toBe(200);
    expect(await recorded(port)).toMatchObject([
      { body: null, raw: "not json at all" },
    ]);
  });

  it("rejects and drops a body over the size cap", async () => {
    await start({ maxBodyBytes: 32 });

    const { status } = await post(port, eventPayload("x".repeat(100)));

    expect(status).toBe(413);
    expect(await recorded(port)).toEqual([]);
  });

  it("retains only the most recent events once the cap is reached", async () => {
    await start({ maxEvents: 2 });

    await post(port, eventPayload("first"));
    await post(port, eventPayload("second"));
    await post(port, eventPayload("third"));

    const events = await recorded(port);
    expect(events.map((e) => e.body.payload.name)).toEqual(["second", "third"]);
  });

  it("allows cross-origin posts from the app, including the tracker's cache header", async () => {
    await start();

    const preflight = await request(port, {
      method: "OPTIONS",
      path: "/api/send",
      headers: {
        origin: "http://localhost:4000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-track-cache",
      },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("*");
    expect(preflight.headers["access-control-allow-headers"]).toMatch(
      /x-track-cache/i,
    );
    const { headers } = await post(port, eventPayload("pageview"));
    expect(headers["access-control-allow-origin"]).toBe("*");
  });

  it("answers an unknown route with a 404", async () => {
    await start();

    const { status } = await request(port, { path: "/nope" });

    expect(status).toBe(404);
  });
});
