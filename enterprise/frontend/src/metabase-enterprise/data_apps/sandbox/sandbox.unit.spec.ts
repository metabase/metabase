import createVirtualEnvironment from "@locker/near-membrane-dom";

import { DATA_APP_GLOBAL_NAMES } from "./globals";
import { createDataAppSandbox } from "./sandbox";

jest.mock("@locker/near-membrane-dom");

const mockedCreateEnv = jest.mocked(createVirtualEnvironment);

type Endowments = Parameters<typeof createDataAppSandbox>[0]["endowments"];
type EnvEndowments = Record<string, PropertyDescriptor>;

function baseEndowments(overrides: Partial<Endowments> = {}): Endowments {
  return {
    React: { marker: "REACT" },
    reactDom: {},
    reactDomClient: {},
    reactDomServer: {},
    reactJsxRuntime: {},
    sdkExports: { marker: "SDK" },
    dataAppExports: { marker: "DATA_APP" },
    ...overrides,
  };
}

type SetupOpts = {
  overrides?: Partial<Endowments>;
  runBundle?: () => void;
};

function setup({ overrides, runBundle = () => {} }: SetupOpts = {}) {
  let endowments: EnvEndowments | undefined;

  mockedCreateEnv.mockReset();
  mockedCreateEnv.mockImplementation((_targetWindow, options) => {
    endowments = options?.endowments;
    // `VirtualEnvironment` is a class with a large internal surface (link,
    // remap, lazyRemapProperties, …); the sandbox only ever calls `evaluate`.
    return {
      evaluate: () => runBundle(),
    } as unknown as ReturnType<typeof createVirtualEnvironment>;
  });

  const sandbox = createDataAppSandbox({
    endowments: baseEndowments(overrides),
  });

  if (!endowments) {
    throw new Error("createVirtualEnvironment was called without endowments");
  }

  const endowed = Object.fromEntries(
    Object.entries(endowments).map(([name, descriptor]) => [
      name,
      descriptor.value,
    ]),
  );

  return { sandbox, endowed };
}

describe("createDataAppSandbox", () => {
  describe("endowment injection", () => {
    it("endows the React externals under their global names and the SDK/data-app as spread copies", () => {
      const original = baseEndowments();
      const { endowed } = setup({ overrides: original });

      expect(endowed).toMatchObject({
        [DATA_APP_GLOBAL_NAMES.react]: original.React,
        [DATA_APP_GLOBAL_NAMES.reactDom]: original.reactDom,
        [DATA_APP_GLOBAL_NAMES.reactDomClient]: original.reactDomClient,
        [DATA_APP_GLOBAL_NAMES.reactDomServer]: original.reactDomServer,
        [DATA_APP_GLOBAL_NAMES.reactJsxRuntime]: original.reactJsxRuntime,
        [DATA_APP_GLOBAL_NAMES.sdk]: original.sdkExports,
        [DATA_APP_GLOBAL_NAMES.dataApp]: original.dataAppExports,
      });
    });

    it("omits the dev jsx-runtime endowment unless one is provided", () => {
      const withoutDev = setup();

      expect(
        DATA_APP_GLOBAL_NAMES.reactJsxDevRuntime in withoutDev.endowed,
      ).toBe(false);

      const reactJsxDevRuntime = { marker: "DEV" };
      const withDev = setup({ overrides: { reactJsxDevRuntime } });

      expect(withDev.endowed[DATA_APP_GLOBAL_NAMES.reactJsxDevRuntime]).toBe(
        reactJsxDevRuntime,
      );
    });
  });

  describe("evaluate", () => {
    it("throws when the bundle never assigns a factory", () => {
      const { sandbox } = setup();

      expect(() => sandbox.evaluate("code")).toThrow(
        /did not assign a function/,
      );
    });

    it("re-throws an error thrown during evaluation as a host-realm Error", () => {
      const { sandbox } = setup({
        runBundle: () => {
          throw new Error("bundle blew up");
        },
      });

      expect(() => sandbox.evaluate("code")).toThrow("bundle blew up");
    });

    it("falls back to a generic message when the thrown value is unreadable", () => {
      const { sandbox } = setup({
        runBundle: () => {
          // A membrane-opaque throw whose `message` can't be read from the host.
          throw new Proxy(
            {},
            {
              get() {
                throw new Error("no access");
              },
            },
          );
        },
      });

      expect(() => sandbox.evaluate("code")).toThrow(
        "Unknown error inside data-app sandbox",
      );
    });
  });
});
