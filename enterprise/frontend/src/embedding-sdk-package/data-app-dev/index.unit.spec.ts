import { type ConfigEnv, type Plugin, type PluginOption, loadEnv } from "vite";

import { readManifest } from "./config/read-manifest";

import { dataAppConfig } from "./index";

jest.mock("vite", () => ({ loadEnv: jest.fn(() => ({})) }));
jest.mock("@vitejs/plugin-react", () => ({
  __esModule: true,
  default: () => ({ name: "mock-react" }),
}));
jest.mock("./config/build-config", () => ({
  dataAppBuildPlugins: () => [],
  dataAppLibBuild: () => ({}),
  dataAppOutDir: () => "dist",
}));
jest.mock("./config/find-env-root", () => ({
  findEnvRoot: (appRoot: string) => appRoot,
}));
jest.mock("./dev-plugin/plugin", () => ({
  dataAppSandboxDevPlugin: () => ({ name: "mock-sandbox-dev" }),
}));
jest.mock("./config/read-manifest");

const mockedReadManifest = jest.mocked(readManifest);
const mockedLoadEnv = jest.mocked(loadEnv);

const findPlugin = (
  options: PluginOption[],
  name: string,
): Plugin | undefined => {
  for (const option of options) {
    const found = Array.isArray(option)
      ? findPlugin(option, name)
      : option && "name" in option && option.name === name
        ? option
        : undefined;

    if (found) {
      return found;
    }
  }

  return undefined;
};

/** The config the `metabase-data-app` plugin merges over the app's own. */
const resolvePluginConfig = (env: ConfigEnv): unknown => {
  const hook = findPlugin(
    dataAppConfig().plugins ?? [],
    "metabase-data-app",
  )?.config;
  const handler = typeof hook === "function" ? hook : hook?.handler;

  // The hook doesn't use its plugin context, which Vite builds and a test can't.
  return handler && Reflect.apply(handler, undefined, [{}, env]);
};

afterEach(() => jest.resetAllMocks());

describe("dataAppConfig", () => {
  it("builds the config without a data_app.yaml", () => {
    mockedReadManifest.mockReturnValue(null);

    expect(dataAppConfig().plugins).toBeDefined();
  });

  it("builds the config when a manifest is present", () => {
    mockedReadManifest.mockReturnValue({
      manifestPath: "/app/data_app.yaml",
      manifest: { allowed_hosts: [] },
    });

    const config = dataAppConfig();

    expect(config.server?.port).toBe(5174);
    expect(config.plugins).toBeDefined();
  });

  it("uses the port override", () => {
    mockedReadManifest.mockReturnValue({
      manifestPath: "/app/data_app.yaml",
      manifest: {},
    });

    expect(dataAppConfig({ port: 4000 }).server?.port).toBe(4000);
  });

  it.each<ConfigEnv>([
    { command: "serve", mode: "development" },
    { command: "build", mode: "production" },
  ])(
    "exposes only DATA_APP_PUBLIC_ env vars to the bundle ($command)",
    (env) => {
      mockedReadManifest.mockReturnValue(null);
      mockedLoadEnv.mockReturnValue({});

      expect(resolvePluginConfig(env)).toMatchObject({
        envPrefix: "DATA_APP_PUBLIC_",
      });
    },
  );
});
