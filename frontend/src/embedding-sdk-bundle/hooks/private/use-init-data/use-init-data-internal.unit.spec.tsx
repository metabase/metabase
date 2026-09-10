import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { reinitialize } from "metabase/plugins";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-entity-data";
import { createMockTransform } from "metabase-types/api/mocks";

import { useInitData, useInitDataInternal } from "./use-init-data-internal";

// Visualization registration is unrelated to these initialization tests.
jest.mock("metabase/visualizations/register", () => ({
  registerVisualizations: jest.fn(),
}));
jest.mock("metabase/dashboard/visualizations/register", () => ({
  registerDashboardVisualizations: jest.fn(),
}));

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

describe("useInitDataInternal with an initialized store", () => {
  const transform = createMockTransform({ id: 42, name: "Existing transform" });

  function TransformName() {
    const { entity } = useEntityData(transform.id, "transform");
    return <span>{entity?.name}</span>;
  }

  function InitializedProvider() {
    useInitDataInternal({
      reduxStore: fakeReduxStore(),
      authConfig: { metabaseInstanceUrl: "http://localhost:3000" },
    });
    return <TransformName />;
  }

  beforeEach(() => {
    reinitialize();
    fetchMock.get("path:/api/transform/42", transform);
  });

  afterEach(() => {
    reinitialize();
  });

  it("loads a child's transform on the first render with an initialized store", async () => {
    const { unmount } = renderWithProviders(<InitializedProvider />);
    expect(await screen.findByText(transform.name)).toBeInTheDocument();
    unmount();
  });

  it("loads transforms after plugins are reset between provider mounts", async () => {
    const { unmount: unmountFirst } = renderWithProviders(
      <InitializedProvider />,
    );
    expect(await screen.findByText(transform.name)).toBeInTheDocument();
    unmountFirst();

    reinitialize();

    const { unmount: unmountSecond } = renderWithProviders(
      <InitializedProvider />,
    );
    expect(await screen.findByText(transform.name)).toBeInTheDocument();
    unmountSecond();
  });
});
