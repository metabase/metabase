import fs from "node:fs";
import path from "node:path";

import { build } from "vite";

import {
  DATA_APP_DEV_CONFIG_VIRTUAL_ID,
  DATA_APP_DEV_ENTRY_VIRTUAL_ID,
} from "build-configs/embedding-sdk/constants/data-app-virtual-modules";

import {
  DATA_APP_BUNDLE_URL,
  DATA_APP_REBUILT_EVENT,
} from "../constants/bundle";
import {
  DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
  DATA_APP_DIAGNOSTICS_EVENT,
  DATA_APP_DIAGNOSTICS_URL,
} from "../constants/diagnostics-channel";

import { dataAppSandboxDevPlugin } from "./plugin";

jest.mock("vite", () => ({ build: jest.fn() }));
// Mock at the app's own config boundary rather than the individual Vite plugins
// it pulls in (`vite-plugin-css-injected-by-js`, `vite-plugin-svgr`): `build`
// is stubbed out anyway, so the plugin never uses these values — the test only
// needs `build-config` not to import those ESM-only packages at load time.
jest.mock("../config/build-config", () => ({
  dataAppBuildPlugins: () => [],
  dataAppLibBuild: () => ({}),
}));
jest.mock("node:fs");

const mockedBuild = jest.mocked(build);
const mockedFs = jest.mocked(fs);

const RESOLVED = (id: string) => `\0${id}`;

type FakeServer = {
  config: {
    root: string;
    mode: string;
    logger: { error: jest.Mock };
    server: { headers: Record<string, string | null> };
  };
  ws: { send: jest.Mock; on: jest.Mock; clients: Set<unknown> };
  middlewares: { use: jest.Mock };
  watcher: { on: jest.Mock };
  transformIndexHtml: jest.Mock;
};
type TestPlugin = {
  name: string;
  apply: string;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
  configureServer: (server: FakeServer) => Promise<() => void>;
};

const APP_SLUG = "test-app";

function makePlugin(appSlug: string, allowedHosts: string[] = []): TestPlugin {
  // Vite declares every hook on `Plugin` as an `ObjectHook` union (a function or
  // a `{ handler }` object) bound to Rollup's plugin context. The tests call the
  // hooks we return as plain functions, which no assignable type expresses.
  return dataAppSandboxDevPlugin(
    appSlug,
    allowedHosts,
  ) as unknown as TestPlugin;
}

describe("dataAppSandboxDevPlugin", () => {
  afterEach(() => jest.clearAllMocks());

  it("only applies to the dev server", () => {
    const plugin = makePlugin(APP_SLUG);

    expect(plugin.name).toBe("metabase-data-app-dev");
    expect(plugin.apply).toBe("serve");
  });

  describe("virtual modules", () => {
    const setup = (allowedHosts: string[] = []) => {
      return { plugin: makePlugin(APP_SLUG, allowedHosts) };
    };

    it("resolves the dev-entry and config virtual ids to synthetic ids", () => {
      const { plugin } = setup();

      expect(plugin.resolveId(DATA_APP_DEV_ENTRY_VIRTUAL_ID)).toBe(
        RESOLVED(DATA_APP_DEV_ENTRY_VIRTUAL_ID),
      );
      expect(plugin.resolveId(DATA_APP_DEV_CONFIG_VIRTUAL_ID)).toBe(
        RESOLVED(DATA_APP_DEV_CONFIG_VIRTUAL_ID),
      );
    });

    it("ignores unrelated ids", () => {
      expect(setup().plugin.resolveId("react")).toBeUndefined();
    });

    it("serves the prebuilt dev entry source for the entry virtual id", () => {
      mockedFs.readFileSync.mockReturnValue("DEV_ENTRY_SOURCE");
      const { plugin } = setup();

      expect(plugin.load(RESOLVED(DATA_APP_DEV_ENTRY_VIRTUAL_ID))).toBe(
        "DEV_ENTRY_SOURCE",
      );
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining("data-app-dev-entry.js"),
        "utf8",
      );
    });

    it("generates the config module with the app's allowed hosts and bundle constants", () => {
      const { plugin } = setup(["https://api.example.com"]);
      const source = plugin.load(RESOLVED(DATA_APP_DEV_CONFIG_VIRTUAL_ID));

      expect(source).toContain(
        `export const allowedHosts = ${JSON.stringify(["https://api.example.com"])};`,
      );
      expect(source).toContain(`export const appSlug = "test-app";`);
      expect(source).toContain(
        `export const bundleUrl = ${JSON.stringify(DATA_APP_BUNDLE_URL)};`,
      );
      expect(source).toContain(
        `export const rebuiltEvent = ${JSON.stringify(DATA_APP_REBUILT_EVENT)};`,
      );
    });

    it("does not load unrelated ids", () => {
      expect(setup().plugin.load("\0other")).toBeUndefined();
    });
  });

  describe("dev server wiring", () => {
    const DEV_CSP = "connect-src 'self'; form-action 'none'; frame-src 'self'";

    function makeServer(): FakeServer {
      return {
        config: {
          root: "/app",
          mode: "development",
          logger: { error: jest.fn() },
          server: { headers: { "Content-Security-Policy": DEV_CSP } },
        },
        ws: { send: jest.fn(), on: jest.fn(), clients: new Set() },
        middlewares: { use: jest.fn() },
        watcher: { on: jest.fn() },
        transformIndexHtml: jest.fn(async (_url: string, html: string) => html),
      };
    }

    async function setup(bundleCode = "BUNDLE_CODE") {
      // Rollup's `OutputChunk` declares ~20 required fields; the plugin only
      // reads `type` and `code`, so the stub deliberately omits the rest.
      mockedBuild.mockResolvedValue({
        output: [{ type: "chunk", code: bundleCode }],
      } as unknown as Awaited<ReturnType<typeof build>>);

      const server = makeServer();

      // `configureServer` returns a hook Vite runs after its own middlewares;
      // call it so the document (index.html) middleware is registered too.
      const registerLateMiddleware =
        await makePlugin(APP_SLUG).configureServer(server);
      registerLateMiddleware();

      return { server };
    }

    it("builds the bundle on startup and serves it at the bundle URL", async () => {
      const { server } = await setup("BUNDLE_CODE");

      expect(mockedBuild).toHaveBeenCalledTimes(1);

      const bundleMiddleware = server.middlewares.use.mock.calls[0][0];
      const res = { statusCode: 0, setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      bundleMiddleware({ url: DATA_APP_BUNDLE_URL }, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/javascript",
      );
      expect(res.end).toHaveBeenCalledWith("BUNDLE_CODE");
      expect(next).not.toHaveBeenCalled();
    });

    it("passes non-bundle requests through to the next middleware", async () => {
      const { server } = await setup();

      const bundleMiddleware = server.middlewares.use.mock.calls[0][0];
      const next = jest.fn();
      bundleMiddleware(
        { url: "/some/asset.js" },
        { setHeader: jest.fn(), end: jest.fn() },
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);
    });

    it("rebuilds and notifies the client when a src file changes", async () => {
      const { server } = await setup();
      expect(mockedBuild).toHaveBeenCalledTimes(1);

      const [event, onWatch] = server.watcher.on.mock.calls[0];
      expect(event).toBe("all");

      await onWatch("change", `/app${path.sep}src${path.sep}index.tsx`);

      expect(mockedBuild).toHaveBeenCalledTimes(2);
      expect(server.ws.send).toHaveBeenCalledWith({
        type: "custom",
        event: DATA_APP_REBUILT_EVENT,
      });
    });

    it("rebuilds when a src file is added or removed, not only edited", async () => {
      const { server } = await setup();
      const onWatch = server.watcher.on.mock.calls[0][1];

      await onWatch("add", `/app${path.sep}src${path.sep}new.tsx`);
      await onWatch("unlink", `/app${path.sep}src${path.sep}old.tsx`);

      expect(mockedBuild).toHaveBeenCalledTimes(3);
    });

    it("ignores changes outside src/", async () => {
      const { server } = await setup();

      const onWatch = server.watcher.on.mock.calls[0][1];
      await onWatch("change", "/app/README.md");

      expect(mockedBuild).toHaveBeenCalledTimes(1);
      expect(server.ws.send).not.toHaveBeenCalled();
    });

    describe("manifest validation", () => {
      it("re-validates when data_app.yaml changes, and serves it on the feed", async () => {
        const { server } = await setup();
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(
          "name: Renamed\npath: dist/index.js\n",
        );

        const onWatch = server.watcher.on.mock.calls[0][1];

        await onWatch("change", `/app${path.sep}data_app.yaml`);

        // The status is read from the feed, not pushed to the page — the page
        // used to echo it back, which raced and reported "not validated yet".
        const middleware = server.middlewares.use.mock.calls
          .map((call) => call[0])
          .find((handler) => {
            const probe = { setHeader: jest.fn(), end: jest.fn() };
            const next = jest.fn();
            handler(
              { url: DATA_APP_DIAGNOSTICS_URL, method: "GET" },
              probe,
              next,
            );
            return !next.mock.calls.length;
          });
        const res = { setHeader: jest.fn(), end: jest.fn() };
        middleware?.(
          { url: DATA_APP_DIAGNOSTICS_URL, method: "GET" },
          res,
          jest.fn(),
        );

        expect(JSON.parse(res.end.mock.calls[0][0]).manifest).toMatchObject({
          name: "Renamed",
        });
      });

      it("does not rebuild the bundle for a manifest change", async () => {
        const { server } = await setup();

        const onWatch = server.watcher.on.mock.calls[0][1];
        await onWatch("change", `/app${path.sep}data_app.yaml`);

        expect(mockedBuild).toHaveBeenCalledTimes(1);
        expect(server.ws.send).not.toHaveBeenCalled();
      });
    });

    describe("synthetic index.html document", () => {
      // Registered by the post-hook, so it's always the last one added.
      const getDocumentMiddleware = (server: FakeServer) =>
        server.middlewares.use.mock.calls.at(-1)[0];

      it("serves the transformed shell with the configured CSP for navigations", async () => {
        const { server } = await setup();
        const res = { statusCode: 0, setHeader: jest.fn(), end: jest.fn() };
        const next = jest.fn();

        await getDocumentMiddleware(server)(
          { method: "GET", headers: { accept: "text/html" }, url: "/" },
          res,
          next,
        );

        // The shell HTML goes through Vite's transform (HMR client, etc.).
        expect(server.transformIndexHtml).toHaveBeenCalledWith(
          "/",
          expect.stringContaining('<div id="root">'),
        );
        // The dev CSP configured on the server is copied onto the document.
        expect(res.setHeader).toHaveBeenCalledWith(
          "Content-Security-Policy",
          DEV_CSP,
        );
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
        expect(res.end).toHaveBeenCalledWith(
          expect.stringContaining("<!doctype html>"),
        );
        expect(next).not.toHaveBeenCalled();
      });

      it("leaves non-HTML requests for the next middleware", async () => {
        const { server } = await setup();
        const next = jest.fn();

        await getDocumentMiddleware(server)(
          {
            method: "GET",
            headers: { accept: "application/javascript" },
            url: "/some/asset.js",
          },
          { setHeader: jest.fn(), end: jest.fn() },
          next,
        );

        expect(server.transformIndexHtml).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
      });

      it("forwards transformIndexHtml errors to the next middleware", async () => {
        const { server } = await setup();
        const error = new Error("transform failed");
        server.transformIndexHtml.mockRejectedValueOnce(error);
        const next = jest.fn();

        await getDocumentMiddleware(server)(
          { method: "GET", headers: { accept: "text/html" }, url: "/" },
          { statusCode: 0, setHeader: jest.fn(), end: jest.fn() },
          next,
        );

        expect(next).toHaveBeenCalledWith(error);
      });
    });

    describe("diagnostics feed", () => {
      /** Drive the JSON endpoint the way connect would, and parse the response. */
      const request = (server: FakeServer, url: string, method = "GET") => {
        const middleware = server.middlewares.use.mock.calls
          .map((call) => call[0])
          .find((handler) => {
            const res = { setHeader: jest.fn(), end: jest.fn() };
            const next = jest.fn();
            handler(
              { url: DATA_APP_DIAGNOSTICS_URL, method: "GET" },
              res,
              next,
            );
            return !next.mock.calls.length;
          });

        const res = { statusCode: 0, setHeader: jest.fn(), end: jest.fn() };
        const next = jest.fn();
        middleware?.({ url, method }, res, next);

        const [payload] = res.end.mock.calls[0] ?? [];

        return {
          next,
          res,
          body: typeof payload === "string" ? JSON.parse(payload) : null,
        };
      };

      const report = (
        server: FakeServer,
        entries: unknown[],
        sessionId?: string,
      ) => {
        const handler = server.ws.on.mock.calls.find(
          ([event]) => event === DATA_APP_DIAGNOSTICS_EVENT,
        )?.[1];
        handler({ sessionId, entries, connection: { reachable: true } });
      };

      it("refuses a method it does not serve", async () => {
        const { server } = await setup();

        const { res, next } = request(server, DATA_APP_DIAGNOSTICS_URL, "POST");

        expect(res.statusCode).toBe(405);
        expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET, DELETE");
        expect(next).not.toHaveBeenCalled();
      });

      it("serves what the page reported, and passes other URLs through", async () => {
        const { server } = await setup();

        report(server, [
          { id: 1, kind: "error", summary: "boom", alert: true },
          { id: 2, kind: "sdk-call", summary: "POST /api/dataset → 400" },
        ]);

        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);
        expect(
          body.entries.map((entry: { eventId: number }) => entry.eventId),
        ).toEqual([1, 2]);
        expect(body.connection).toEqual({ reachable: true });
        expect(body.nextEventId).toBe(3);

        expect(request(server, "/something-else").next).toHaveBeenCalled();
      });

      it("re-stamps ids so a page reload can't hide entries behind a poller's cursor", async () => {
        const { server } = await setup();

        // First page: ids 1..2 from its own counter.
        report(server, [
          { id: 1, summary: "before reload" },
          { id: 2, summary: "also before" },
        ]);
        const cursor = request(server, DATA_APP_DIAGNOSTICS_URL).body
          .nextEventId;

        // The preview reloads; the page's counter restarts at 1.
        report(server, [{ id: 1, summary: "after reload" }]);

        const { body } = request(
          server,
          `${DATA_APP_DIAGNOSTICS_URL}?startEventId=${cursor}`,
        );
        expect(body.entries.map((e: { summary: string }) => e.summary)).toEqual(
          ["after reload"],
        );
      });

      it("carries the manifest before any client has reported", async () => {
        // Regression: the manifest used to round-trip through the page, so the
        // feed said "not validated yet" whenever that echo hadn't happened.
        const { server } = await setup();

        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);

        expect(body.manifest).toEqual(
          expect.objectContaining({ errors: expect.any(Array) }),
        );
      });

      it("keeps the manifest even when the page reports without one", async () => {
        const { server } = await setup();
        report(server, [{ eventId: 1, summary: "boom" }]);

        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);

        expect(body.manifest).not.toBeNull();
      });

      it("caps oversized text the socket sends", async () => {
        const { server } = await setup();
        // The socket is only as trustworthy as any local process, and this buffer
        // is re-serialized on every poll.
        report(server, [
          {
            eventId: 1,
            summary: "x".repeat(50_000),
            detail: "y".repeat(50_000),
          },
        ]);

        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);

        expect(body.entries[0].summary.length).toBeLessThan(6_000);
        expect(body.entries[0].detail.length).toBeLessThan(6_000);
        expect(body.entries[0].summary).toContain("truncated");
      });

      it("serves both pages after a reload, and only the new one from a cursor", async () => {
        const { server } = await setup();

        report(server, [{ eventId: 1, summary: "before reload" }], "page-1");
        const cursor = request(server, DATA_APP_DIAGNOSTICS_URL).body
          .nextEventId;

        report(server, [{ eventId: 2, summary: "after reload" }], "page-2");

        // A reader with no cursor gets the whole buffer, including what the
        // page was reloaded over; one that kept its cursor gets only the rest.
        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);
        expect(body.entries.map((e: { summary: string }) => e.summary)).toEqual(
          ["before reload", "after reload"],
        );
        expect(body.sessionId).toBe("page-2");

        const fromCursor = request(
          server,
          `${DATA_APP_DIAGNOSTICS_URL}?startEventId=${cursor}`,
        ).body;
        expect(
          fromCursor.entries.map((e: { summary: string }) => e.summary),
        ).toEqual(["after reload"]);
      });

      it("keeps events across a soft reload (same sessionId)", async () => {
        const { server } = await setup();

        report(server, [{ eventId: 1, summary: "first" }], "page-1");
        report(server, [{ eventId: 2, summary: "second" }], "page-1");

        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);

        expect(body.entries).toHaveLength(2);
      });

      it("returns only events from `startEventId` onward", async () => {
        const { server } = await setup();
        report(server, [
          { id: 1, summary: "old" },
          { id: 2, summary: "new" },
        ]);

        const { body } = request(
          server,
          `${DATA_APP_DIAGNOSTICS_URL}?startEventId=2`,
        );

        expect(body.entries).toHaveLength(1);
        expect(body.entries[0].summary).toBe("new");
      });

      it("reports connected clients, so an empty feed isn't read as healthy", async () => {
        const { server } = await setup();

        expect(request(server, DATA_APP_DIAGNOSTICS_URL).body).toMatchObject({
          entries: [],
          clients: 0,
          lastReportAt: null,
        });

        server.ws.clients.add({});
        report(server, []);

        const { body } = request(server, DATA_APP_DIAGNOSTICS_URL);
        expect(body.clients).toBe(1);
        expect(body.lastReportAt).toEqual(expect.any(Number));
      });

      const changeNudges = (server: FakeServer) =>
        server.ws.send.mock.calls.filter(
          ([message]) => message?.event === DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
        ).length;

      it("nudges readers when a report brings something new", async () => {
        const { server } = await setup();

        report(server, [{ summary: "boom" }], "page-1");

        // The nudge carries no payload: readers re-read the endpoint, so the
        // toolbar and a shell agent still see the same bytes.
        expect(changeNudges(server)).toBe(1);
        expect(server.ws.send).toHaveBeenCalledWith({
          type: "custom",
          event: DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
        });
      });

      it("stays quiet when a report brings nothing new", async () => {
        const { server } = await setup();

        report(server, [{ summary: "boom" }], "page-1");
        report(server, [], "page-1");
        report(server, [], "page-1");

        // The reporter flushes on a timer whether or not anything happened.
        // Nudging on those would rebuild the poll loop from the other side.
        expect(changeNudges(server)).toBe(1);
      });
    });
  });
});
