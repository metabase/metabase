import createVirtualEnvironment from "@locker/near-membrane-dom";

import { DATA_APP_GLOBAL_NAMES } from "./globals";
import { createDataAppSandbox } from "./sandbox";

jest.mock("@locker/near-membrane-dom");

const mockedCreateEnv = jest.mocked(createVirtualEnvironment);

type Endowments = Parameters<typeof createDataAppSandbox>[0]["endowments"];
type EnvEndowments = Record<string, PropertyDescriptor>;

function baseEndowments(overrides: Partial<Endowments> = {}): Endowments {
  return {
    providerPropsStore: { marker: "STORE" },
    sdkMount: jest.fn(),
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

  return { sandbox, endowments };
}

describe("createDataAppSandbox", () => {
  describe("endowment injection", () => {
    it("endows the provider-props store and the mediated-mount bridge as values", () => {
      const original = baseEndowments();
      const { endowments } = setup({ overrides: original });

      expect(endowments.METABASE_PROVIDER_PROPS_STORE.value).toBe(
        original.providerPropsStore,
      );
      expect(endowments.__MB_DATA_APP_SDK_MOUNT__.value).toBe(
        original.sdkMount,
      );
    });

    it("endows the SDK bundle as a live getter off the host window", () => {
      const { endowments } = setup();
      const descriptor = endowments.METABASE_EMBEDDING_SDK_BUNDLE;

      expect(typeof descriptor.get).toBe("function");

      const asBundle = (value: unknown) =>
        // The getter only reads the reference through, so a marker object can
        // stand in for the real (huge) bundle shape.
        value as typeof window.METABASE_EMBEDDING_SDK_BUNDLE;

      const original = window.METABASE_EMBEDDING_SDK_BUNDLE;
      try {
        // Absent at sandbox creation — in the dev entry the bundle only lands on
        // the window once it loads from the instance.
        window.METABASE_EMBEDDING_SDK_BUNDLE = asBundle(undefined);
        expect(descriptor.get?.()).toBeUndefined();

        // Picked up live on the next read once the load lands.
        const bundle = asBundle({ marker: "BUNDLE" });
        window.METABASE_EMBEDDING_SDK_BUNDLE = bundle;
        expect(descriptor.get?.()).toBe(bundle);
      } finally {
        window.METABASE_EMBEDDING_SDK_BUNDLE = original;
      }
    });

    it("wires the factory global as a get/set pair backed by the captured factory", () => {
      const { endowments } = setup();
      const descriptor = endowments[DATA_APP_GLOBAL_NAMES.factory];

      expect(descriptor.get?.()).toBeUndefined();

      const factory = () => ({ component: () => null });
      descriptor.set?.(factory);
      expect(descriptor.get?.()).toBe(factory);
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
