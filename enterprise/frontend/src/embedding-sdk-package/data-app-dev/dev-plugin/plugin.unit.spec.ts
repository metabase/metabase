import fs from "node:fs";
import path from "node:path";

import { build } from "vite";

import {
  DATA_APP_DEV_CONFIG_VIRTUAL_ID,
  DATA_APP_DEV_ENTRY_VIRTUAL_ID,
} from "build-configs/embedding-sdk/constants/data-app-virtual-modules";

import { DATA_APP_BUNDLE_URL, DATA_APP_REBUILT_EVENT } from "../bundle";

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
  ws: { send: jest.Mock };
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

function makePlugin(allowedHosts: string[] = []): TestPlugin {
  return dataAppSandboxDevPlugin(allowedHosts) as unknown as TestPlugin;
}

describe("dataAppSandboxDevPlugin", () => {
  afterEach(() => jest.clearAllMocks());

  it("only applies to the dev server", () => {
    const plugin = makePlugin();

    expect(plugin.name).toBe("metabase-data-app-dev");
    expect(plugin.apply).toBe("serve");
  });

  describe("virtual modules", () => {
    const setup = (allowedHosts: string[] = []) => {
      return { plugin: makePlugin(allowedHosts) };
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
        ws: { send: jest.fn() },
        middlewares: { use: jest.fn() },
        watcher: { on: jest.fn() },
        transformIndexHtml: jest.fn(async (_url: string, html: string) => html),
      };
    }

    async function setup(bundleCode = "BUNDLE_CODE") {
      mockedBuild.mockResolvedValue({
        output: [{ type: "chunk", code: bundleCode }],
      } as unknown as Awaited<ReturnType<typeof build>>);

      const server = makeServer();

      // `configureServer` returns a hook Vite runs after its own middlewares;
      // call it so the document (index.html) middleware is registered too.
      const registerLateMiddleware = await makePlugin().configureServer(server);
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

      const [event, onChange] = server.watcher.on.mock.calls[0];
      expect(event).toBe("change");

      await onChange(`/app${path.sep}src${path.sep}index.tsx`);

      expect(mockedBuild).toHaveBeenCalledTimes(2);
      expect(server.ws.send).toHaveBeenCalledWith({
        type: "custom",
        event: DATA_APP_REBUILT_EVENT,
      });
    });

    it("ignores changes outside src/", async () => {
      const { server } = await setup();

      const onChange = server.watcher.on.mock.calls[0][1];
      await onChange("/app/README.md");

      expect(mockedBuild).toHaveBeenCalledTimes(1);
      expect(server.ws.send).not.toHaveBeenCalled();
    });

    describe("synthetic index.html document", () => {
      // The document middleware is the second one registered: the bundle
      // middleware from `configureServer` (index 0), then this one from the
      // returned late hook (index 1).
      const getDocumentMiddleware = (server: FakeServer) =>
        server.middlewares.use.mock.calls[1][0];

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
  });
});
