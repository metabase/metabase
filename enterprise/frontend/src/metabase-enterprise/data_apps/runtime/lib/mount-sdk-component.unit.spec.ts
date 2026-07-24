import { mountDataAppSdkComponent } from "./mount-sdk-component";

jest.mock("react-dom/client", () => ({
  createRoot: jest.fn(() => ({ render: jest.fn(), unmount: jest.fn() })),
}));

// The bridge is endowed to the untrusted data-app bundle. It must only ever hand
// genuine host SDK-bundle components to host React, and never let a caller
// smuggle a raw DOM tag past the guest `createElement` gate — directly as the
// component, or hidden inside props as a hand-crafted React element.
describe("mountDataAppSdkComponent", () => {
  const ComponentProvider = () => null;
  const StaticQuestion = () => null;
  const InteractiveQuestion = () => null;

  // Widen the component params to `unknown` so tests can pass invalid values.
  const callBridge = mountDataAppSdkComponent as unknown as (
    container: HTMLElement,
    ComponentProvider: unknown,
    providerProps: Record<string, unknown>,
    Component: unknown,
    componentProps: Record<string, unknown>,
  ) => void;

  const reactElement = () => ({
    $$typeof: Symbol.for("react.element"),
    type: "iframe",
    key: null,
    ref: null,
    props: {},
  });

  let container: HTMLElement;

  beforeEach(() => {
    // For testing
    (
      window as unknown as { METABASE_EMBEDDING_SDK_BUNDLE: unknown }
    ).METABASE_EMBEDDING_SDK_BUNDLE = {
      ComponentProvider,
      StaticQuestion,
      InteractiveQuestion,
      // A non-component export — present in the bundle but not a component.
      queryDataset: () => {},
    };

    container = document.createElement("div");
  });

  afterEach(() => {
    // @ts-expect-error - tearing down the ad-hoc global between tests.
    delete window.METABASE_EMBEDDING_SDK_BUNDLE;
  });

  describe("component allowlist", () => {
    it("mounts a genuine SDK bundle component", () => {
      expect(() =>
        callBridge(container, ComponentProvider, {}, StaticQuestion, {}),
      ).not.toThrow();
    });

    it("rejects a raw tag passed as the component", () => {
      expect(() =>
        callBridge(container, ComponentProvider, {}, "iframe", {}),
      ).toThrow(/only SDK bundle components/);
    });

    it("rejects a component the guest crafted (not from the bundle)", () => {
      expect(() =>
        callBridge(container, ComponentProvider, {}, () => null, {}),
      ).toThrow(/only SDK bundle components/);
    });

    it("rejects an untrusted ComponentProvider", () => {
      expect(() =>
        callBridge(container, () => null, {}, StaticQuestion, {}),
      ).toThrow(/only SDK bundle components/);
    });
  });

  describe("smuggled React nodes in props", () => {
    it("rejects a React element in componentProps", () => {
      expect(() =>
        callBridge(container, ComponentProvider, {}, InteractiveQuestion, {
          children: reactElement(),
        }),
      ).toThrow(/React nodes are not allowed/);
    });

    it("rejects a React element nested in a componentProps array", () => {
      expect(() =>
        callBridge(container, ComponentProvider, {}, InteractiveQuestion, {
          children: [reactElement()],
        }),
      ).toThrow(/React nodes are not allowed/);
    });

    it("rejects a React element in providerProps", () => {
      expect(() =>
        callBridge(
          container,
          ComponentProvider,
          { children: reactElement() },
          StaticQuestion,
          {},
        ),
      ).toThrow(/React nodes are not allowed/);
    });

    it("allows plain data props without false positives", () => {
      expect(() =>
        callBridge(container, ComponentProvider, {}, StaticQuestion, {
          card: { query: { type: "query", "source-table": 1 } },
          height: "320px",
          onChange: () => {},
        }),
      ).not.toThrow();
    });
  });
});
