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
  realmHostUrl?: string;
};

async function setup({
  overrides,
  runBundle = () => {},
  realmHostUrl,
}: SetupOpts = {}) {
  let endowments: EnvEndowments | undefined;
  let options: Parameters<typeof createVirtualEnvironment>[1] | undefined;

  // The sandbox evaluates a realm-hardening prelude (pins Error.prepareStackTrace)
  // BEFORE the bundle; only the bundle should drive `runBundle`.
  const evaluate = jest.fn((code?: string) => {
    if (typeof code === "string" && code.includes("prepareStackTrace")) {
      return;
    }
    return runBundle();
  });

  mockedCreateEnv.mockReset();
  mockedCreateEnv.mockImplementation((_targetWindow, envOptions) => {
    options = envOptions;
    endowments = envOptions?.endowments;
    // `VirtualEnvironment` is a class with a large internal surface (link,
    // remap, lazyRemapProperties, …); the sandbox only ever calls `evaluate`.
    return {
      evaluate,
    } as unknown as ReturnType<typeof createVirtualEnvironment>;
  });

  const sandbox = await createDataAppSandbox({
    endowments: baseEndowments(overrides),
    realmHostUrl,
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

  return { sandbox, endowed, options, evaluate };
}

describe("createDataAppSandbox", () => {
  describe("realm document", () => {
    // The realm is served from its own document so `'unsafe-eval'` lives in ITS
    // CSP, not the data-app document's — see `realmHostUrl`.
    it("points the membrane's realm iframe at the realm host when given one", async () => {
      const { options } = await setup({
        realmHostUrl: "/api/apps/sandbox-host",
      });

      // Untyped: `iframeSrc` comes from Metabase's near-membrane patch, so it is
      // absent from the upstream option types.
      expect((options as { iframeSrc?: string })?.iframeSrc).toBe(
        "/api/apps/sandbox-host",
      );
    });

    // Without one the realm falls back to `about:blank`, which inherits the host
    // document's CSP. That is the dev-server case, where the instance-served
    // realm document would be cross-origin and unreachable to the membrane.
    it("omits iframeSrc entirely when no realm host is given", async () => {
      const { options } = await setup();

      expect(options).not.toHaveProperty("iframeSrc");
    });
  });

  describe("endowment injection", () => {
    it("endows the React externals under their global names and the SDK/data-app as spread copies", async () => {
      const original = baseEndowments();
      const { endowed } = await setup({ overrides: original });

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

    it("omits the dev jsx-runtime endowment unless one is provided", async () => {
      const withoutDev = await setup();

      expect(
        DATA_APP_GLOBAL_NAMES.reactJsxDevRuntime in withoutDev.endowed,
      ).toBe(false);

      const reactJsxDevRuntime = { marker: "DEV" };
      const withDev = await setup({ overrides: { reactJsxDevRuntime } });

      expect(withDev.endowed[DATA_APP_GLOBAL_NAMES.reactJsxDevRuntime]).toBe(
        reactJsxDevRuntime,
      );
    });
  });

  describe("realm hardening", () => {
    it("gates Error.prepareStackTrace before the bundle runs: drops functions, allows undefined", async () => {
      const { evaluate } = await setup();

      // The prelude is the first thing evaluated — before any bundle code.
      expect(evaluate).toHaveBeenCalledTimes(1);
      const [preludeCode] = evaluate.mock.calls[0];
      if (typeof preludeCode !== "string") {
        throw new Error("expected a prelude string to be evaluated");
      }

      // Run the prelude against a throwaway `Error` stand-in and assert the
      // behaviour it installs, not just its source text. The prelude references a
      // global `Error`, so shadow it with the stand-in.
      const fakeError: { prepareStackTrace?: unknown } = {};
      new Function("Error", preludeCode)(fakeError);

      // A function formatter (the attack) is silently dropped.
      fakeError.prepareStackTrace = () => "host-reference";
      expect(fakeError.prepareStackTrace).toBeUndefined();

      // `undefined` still passes through (React dev sets it, then restores).
      fakeError.prepareStackTrace = undefined;
      expect(fakeError.prepareStackTrace).toBeUndefined();

      // The accessor is non-configurable, so the guest can't redefine it away.
      expect(() =>
        Object.defineProperty(fakeError, "prepareStackTrace", {
          value: () => "host-reference",
        }),
      ).toThrow();
    });
  });

  describe("evaluate", () => {
    it("throws when the bundle never assigns a factory", async () => {
      const { sandbox } = await setup();

      expect(() => sandbox.evaluate("code")).toThrow(
        /did not assign a function/,
      );
    });

    it("re-throws an error thrown during evaluation as a host-realm Error", async () => {
      const { sandbox } = await setup({
        runBundle: () => {
          throw new Error("bundle blew up");
        },
      });

      expect(() => sandbox.evaluate("code")).toThrow("bundle blew up");
    });

    it("falls back to a generic message when the thrown value is unreadable", async () => {
      const { sandbox } = await setup({
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
