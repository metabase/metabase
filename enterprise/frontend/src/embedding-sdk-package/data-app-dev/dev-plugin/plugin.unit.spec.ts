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
jest.mock("../config/build-config", () => ({
  dataAppBuildPlugins: () => [],
  dataAppLibBuild: () => ({}),
}));
jest.mock("node:fs");

const mockedBuild = jest.mocked(build);
const mockedFs = jest.mocked(fs);

const RESOLVED = (id: string) => `\0${id}`;

type ConnectReq = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
};
type ConnectRes = { statusCode: number; setHeader: jest.Mock; end: jest.Mock };
type ConnectHandler = (
  req: ConnectReq,
  res: ConnectRes,
  next: (err?: unknown) => void,
) => unknown;

type RequestResult = {
  res: ConnectRes;
  statusCode: number;
  fellThrough: boolean;
  nextError: unknown;
  body: any;
};

const DEV_CSP = "connect-src 'self'; form-action 'none'; frame-src 'none'";

const APP_SLUG = "test-app";

const isJson = (payload: unknown): payload is string =>
  typeof payload === "string" && /^\s*[[{]/.test(payload);

class FakeDevServer {
  private readonly middlewareStack: ConnectHandler[] = [];
  private readonly wsListeners = new Map<string, (message: unknown) => void>();
  private readonly watchListeners = new Map<
    string,
    ((...args: unknown[]) => unknown)[]
  >();

  readonly config = {
    root: "/app",
    mode: "development",
    logger: { error: jest.fn() },
    server: { headers: { "Content-Security-Policy": DEV_CSP } },
  };

  readonly ws = {
    on: jest.fn((event: string, handler: (message: unknown) => void) => {
      this.wsListeners.set(event, handler);
    }),
    send: jest.fn(),
    clients: new Set<unknown>(),
    emit: (event: string, message: unknown) =>
      this.wsListeners.get(event)?.(message),
  };

  readonly watcher = {
    on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      this.watchListeners.set(event, [
        ...(this.watchListeners.get(event) ?? []),
        handler,
      ]);
    }),
    emit: async (event: string, ...args: unknown[]) => {
      for (const handler of this.watchListeners.get(event) ?? []) {
        await handler(...args);
      }
    },
  };

  readonly middlewares = {
    use: jest.fn((middleware: ConnectHandler) => {
      this.middlewareStack.push(middleware);
    }),
  };

  readonly transformIndexHtml = jest.fn(
    async (_url: string, html: string) => html,
  );

  async request(
    url: string,
    { method = "GET", headers = {} }: RequestOptions = {},
  ): Promise<RequestResult> {
    const req: ConnectReq = { url, method, headers };
    const res: ConnectRes = {
      statusCode: 0,
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    let index = 0;
    let fellThrough = false;
    let nextError: unknown;

    const next = async (err?: unknown): Promise<void> => {
      if (err !== undefined) {
        nextError = err;
        return;
      }

      const middleware = this.middlewareStack[index++];
      if (!middleware) {
        fellThrough = true;
        return;
      }

      await middleware(req, res, next);
    };

    await next();

    const [payload] = res.end.mock.calls[0] ?? [];

    return {
      res,
      statusCode: res.statusCode,
      fellThrough,
      nextError,
      // The feed is JSON; other routes (the bundle, the HTML shell) are
      // asserted through `res.end` directly, so leave `body` null for them.
      body: isJson(payload) ? JSON.parse(payload) : null,
    };
  }
}

type RequestOptions = { method?: string; headers?: Record<string, string> };

type TestPlugin = {
  name: string;
  apply: string;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
  configureServer: (server: FakeDevServer) => Promise<() => void>;
};

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
    async function setup(bundleCode = "BUNDLE_CODE") {
      // Rollup's `OutputChunk` declares ~20 required fields; the plugin only
      // reads `type` and `code`, so the stub deliberately omits the rest.
      mockedBuild.mockResolvedValue({
        output: [{ type: "chunk", code: bundleCode }],
      } as unknown as Awaited<ReturnType<typeof build>>);

      const server = new FakeDevServer();

      // `configureServer` returns a hook Vite runs after its own middlewares;
      // call it so the document (index.html) middleware is registered too.
      const registerLateMiddleware =
        await makePlugin(APP_SLUG).configureServer(server);
      registerLateMiddleware();

      return { server };
    }

    it("builds the bundle on startup and serves it at the bundle URL", async () => {
      const { server } = await setup("BUNDLE_CODE");

      const { res } = await server.request(DATA_APP_BUNDLE_URL);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/javascript",
      );
      expect(res.end).toHaveBeenCalledWith("BUNDLE_CODE");
    });

    it("passes non-bundle requests through to the next middleware", async () => {
      const { server } = await setup();

      expect((await server.request("/some/asset.js")).fellThrough).toBe(true);
    });

    it("rebuilds and notifies the client when a src file changes", async () => {
      const { server } = await setup();
      expect(mockedBuild).toHaveBeenCalledTimes(1);

      await server.watcher.emit(
        "all",
        "change",
        path.join("/app", "src", "index.tsx"),
      );

      expect(mockedBuild).toHaveBeenCalledTimes(2);
      expect(server.ws.send).toHaveBeenCalledWith({
        type: "custom",
        event: DATA_APP_REBUILT_EVENT,
      });
    });

    it("rebuilds when a src file is added or removed, not only edited", async () => {
      const { server } = await setup();

      await server.watcher.emit(
        "all",
        "add",
        path.join("/app", "src", "new.tsx"),
      );
      await server.watcher.emit(
        "all",
        "unlink",
        path.join("/app", "src", "old.tsx"),
      );

      expect(mockedBuild).toHaveBeenCalledTimes(3);
    });

    it("ignores changes outside src/", async () => {
      const { server } = await setup();

      await server.watcher.emit(
        "all",
        "change",
        path.join("/app", "README.md"),
      );

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

        await server.watcher.emit(
          "all",
          "change",
          path.join("/app", "data_app.yaml"),
        );

        // The status is read from the feed, not pushed to the page — the page
        // used to echo it back, which raced and reported "not validated yet".
        const { body } = await server.request(DATA_APP_DIAGNOSTICS_URL);

        expect(body.manifest).toMatchObject({ name: "Renamed" });
      });

      it("does not rebuild the bundle for a manifest change", async () => {
        const { server } = await setup();

        await server.watcher.emit(
          "all",
          "change",
          path.join("/app", "data_app.yaml"),
        );

        expect(mockedBuild).toHaveBeenCalledTimes(1);
        expect(server.ws.send).not.toHaveBeenCalled();
      });
    });

    describe("synthetic index.html document", () => {
      it("serves the transformed shell with the configured CSP for navigations", async () => {
        const { server } = await setup();

        const { res } = await server.request("/", {
          headers: { accept: "text/html" },
        });

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
      });

      it("leaves non-HTML requests for the next middleware", async () => {
        const { server } = await setup();

        const { fellThrough } = await server.request("/some/asset.js", {
          headers: { accept: "application/javascript" },
        });

        expect(fellThrough).toBe(true);
      });

      it("forwards transformIndexHtml errors to the next middleware", async () => {
        const { server } = await setup();
        const error = new Error("transform failed");
        server.transformIndexHtml.mockRejectedValueOnce(error);

        const { nextError } = await server.request("/", {
          headers: { accept: "text/html" },
        });

        expect(nextError).toBe(error);
      });
    });

    describe("diagnostics feed", () => {
      const report = (
        server: FakeDevServer,
        entries: unknown[],
        sessionId?: string,
      ) =>
        server.ws.emit(DATA_APP_DIAGNOSTICS_EVENT, {
          sessionId,
          entries,
          connection: { reachable: true },
        });

      it("refuses a method it does not serve", async () => {
        const { server } = await setup();

        const { statusCode, res } = await server.request(
          DATA_APP_DIAGNOSTICS_URL,
          { method: "POST" },
        );

        expect(statusCode).toBe(405);
        expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET, DELETE");
      });

      it("serves what the page reported, and passes other URLs through", async () => {
        const { server } = await setup();

        report(server, [
          { id: 1, kind: "error", summary: "boom", alert: true },
          { id: 2, kind: "sdk-call", summary: "POST /api/dataset → 400" },
        ]);

        const { body } = await server.request(DATA_APP_DIAGNOSTICS_URL);
        expect(
          body.entries.map((entry: { eventId: number }) => entry.eventId),
        ).toEqual([1, 2]);
        expect(body.connection).toEqual({ reachable: true });
        expect(body.nextEventId).toBe(3);

        expect((await server.request("/something-else")).fellThrough).toBe(
          true,
        );
      });

      it("carries the manifest before any client has reported", async () => {
        // Regression: the manifest used to round-trip through the page, so the
        // feed said "not validated yet" whenever that echo hadn't happened.
        const { server } = await setup();

        const { body } = await server.request(DATA_APP_DIAGNOSTICS_URL);

        expect(body.manifest).toEqual(
          expect.objectContaining({ errors: expect.any(Array) }),
        );
      });

      it("keeps the manifest even when the page reports without one", async () => {
        const { server } = await setup();
        report(server, [{ eventId: 1, summary: "boom" }]);

        const { body } = await server.request(DATA_APP_DIAGNOSTICS_URL);

        expect(body.manifest).not.toBeNull();
      });

      it("returns only events from `startEventId` onward", async () => {
        const { server } = await setup();
        report(server, [
          { id: 1, summary: "old" },
          { id: 2, summary: "new" },
        ]);

        const { body } = await server.request(
          `${DATA_APP_DIAGNOSTICS_URL}?startEventId=2`,
        );

        expect(body.entries).toHaveLength(1);
        expect(body.entries[0].summary).toBe("new");
      });

      it("reports connected clients, so an empty feed isn't read as healthy", async () => {
        const { server } = await setup();

        expect(
          (await server.request(DATA_APP_DIAGNOSTICS_URL)).body,
        ).toMatchObject({
          entries: [],
          clients: 0,
          lastReportAt: null,
        });

        server.ws.clients.add({});
        report(server, []);

        const { body } = await server.request(DATA_APP_DIAGNOSTICS_URL);
        expect(body.clients).toBe(1);
        expect(body.lastReportAt).toEqual(expect.any(Number));
      });

      const changeNudges = (server: FakeDevServer) =>
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
