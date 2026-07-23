import { renderHook } from "@testing-library/react";

import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { PLUGIN_API } from "metabase/plugins";

import { useInitData } from "./use-init-data-internal";

// Keep the test scoped to the header wiring; the viz registry is irrelevant.
// `registerVisualizations` is a named export, so the mock must expose it under
// that name — a bare `jest.fn()` module leaves it `undefined`, and the
// `_.once(registerVisualizations)` call then throws on `undefined.apply`.
jest.mock("metabase/visualizations/register", () => ({
  registerVisualizations: jest.fn(),
}));
jest.mock("metabase/dashboard/visualizations/register", () => jest.fn());

const fakeReduxStore = () =>
  // A stub store: the test only reads `initStatus` and calls `dispatch`/`subscribe`,
  // so it stubs those three members rather than the full `SdkStore` surface.
  ({
    getState: () => ({ sdk: { initStatus: { status: "success" } } }),
    dispatch: jest.fn(),
    subscribe: () => () => {},
  }) as unknown as SdkStore;

const setup = ({
  dataApp,
}: { dataApp?: { name: string; isDev?: boolean } } = {}) => {
  const store = ensureMetabaseProviderPropsStore();

  store.setProps({
    authConfig: { metabaseInstanceUrl: "http://localhost:3000" },
  });
  store.updateInternalProps({ reduxStore: fakeReduxStore(), dataApp });

  return renderHook(() => useInitData());
};

describe("useInitData » data-app context", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };
  const originalHandlers = { ...PLUGIN_API.onBeforeRequestHandlers };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    Object.assign(PLUGIN_API.onBeforeRequestHandlers, originalHandlers);
  });

  it("configures the data-app headers from internalProps.dataApp (dev Vite flow)", () => {
    // Unmount before the test ends: the sdk project's global afterEach resets
    // the props store, which re-renders a still-mounted subscriber against the
    // empty state and makes useInitData throw.
    const { unmount } = setup({ dataApp: { name: "sales", isDev: true } });

    expect(EMBEDDING_SDK_CONFIG.isDataApp).toBe(true);
    expect(EMBEDDING_SDK_CONFIG.isDataAppDev).toBe(true);
    expect(EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader).toBe("data-app");
    expect(EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier).toBe("sales");

    unmount();
  });

  it("leaves the SDK client config untouched without a data-app context", () => {
    const { unmount } = setup();

    expect(EMBEDDING_SDK_CONFIG.isDataApp).toBe(false);
    expect(EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader).toBe(
      "embedding-sdk-react",
    );
    expect(
      EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier,
    ).toBeUndefined();

    unmount();
  });
});
