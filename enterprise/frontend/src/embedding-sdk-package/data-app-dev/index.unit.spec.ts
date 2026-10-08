import { isObject } from "metabase-types/guards";

import {
  COLLECTION,
  makeApp,
  setupResourceTests,
  writeQuery,
  writeResource,
} from "../data-app-resources/tests/setup";

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

  describe("the resource check", () => {
    setupResourceTests();

    const QUESTION = "questionEntityId00010";

    type ResourceCheckPlugin = {
      apply: unknown;
      buildStart: () => Promise<void>;
    };

    const isResourceCheckPlugin = (
      candidate: unknown,
    ): candidate is ResourceCheckPlugin =>
      isObject(candidate) &&
      candidate.name === "metabase-resource-check" &&
      typeof candidate.buildStart === "function";

    // Vite accepts nested plugin arrays, and `dataAppConfig` returns one.
    const flatten = (option: unknown): unknown[] =>
      Array.isArray(option) ? option.flatMap(flatten) : [option];

    /** The plugin of an app in `appRoot`, which vite runs from its own directory. */
    const resourceCheckPlugin = (appRoot: string) => {
      jest.spyOn(process, "cwd").mockReturnValue(appRoot);
      mockedReadManifest.mockReturnValue({
        manifestPath: `${appRoot}/data_app.yaml`,
        manifest: { collection: COLLECTION },
      });

      const plugin = flatten(dataAppConfig().plugins).find(
        isResourceCheckPlugin,
      );

      if (!plugin) {
        throw new Error("The resource check plugin is missing.");
      }

      return plugin;
    };

    const appWithQuery = () => {
      const appRoot = makeApp();
      writeQuery(
        appRoot,
        `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 } });`,
      );
      return appRoot;
    };

    it("runs only for a production build", () => {
      expect(resourceCheckPlugin(appWithQuery()).apply).toBe("build");
    });

    it("lets the build start when the app's resources back its definitions", async () => {
      const appRoot = appWithQuery();
      writeResource(appRoot, "data_app/orders.yaml", {
        name: "Orders",
        type: "question",
        entity_id: QUESTION,
        "serdes/meta": [{ model: "Card", id: QUESTION }],
      });

      await expect(
        resourceCheckPlugin(appRoot).buildStart(),
      ).resolves.toBeUndefined();
    });

    it("fails the build when a definition's resource is missing", async () => {
      await expect(
        resourceCheckPlugin(appWithQuery()).buildStart(),
      ).rejects.toThrow(
        `queries/orders.query.ts:Orders names saved question ${QUESTION}, which no file in collections/data_apps/ holds in the app's collection.`,
      );
    });
  });
});
