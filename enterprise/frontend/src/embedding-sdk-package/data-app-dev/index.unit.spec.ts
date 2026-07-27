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
}));
jest.mock("./config/find-env-root", () => ({
  findEnvRoot: (appRoot: string) => appRoot,
}));
jest.mock("./dev-plugin/plugin", () => ({
  dataAppSandboxDevPlugin: () => ({ name: "mock-sandbox-dev" }),
}));
jest.mock("./config/read-manifest");

const mockedReadManifest = jest.mocked(readManifest);

afterEach(() => jest.resetAllMocks());

describe("dataAppConfig", () => {
  it("throws when the cwd has no data_app.yaml (run from the wrong directory)", () => {
    mockedReadManifest.mockReturnValue(null);

    expect(() => dataAppConfig()).toThrow(/No data_app\.yaml found/);
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
});
