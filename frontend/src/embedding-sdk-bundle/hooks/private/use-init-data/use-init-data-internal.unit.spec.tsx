import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  getSdkStore,
  sdkReducers,
  useSdkStore,
} from "embedding-sdk-bundle/store";
import { initAuth } from "embedding-sdk-bundle/store/auth";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { reinitialize } from "metabase/plugins";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-entity-data";
import { registerTransformQueryHooks } from "metabase/transforms";
import { createMockTransform } from "metabase-types/api/mocks";

import { useInitData, useInitDataInternal } from "./use-init-data-internal";

// Visualization registration is unrelated to these initialization tests.
jest.mock("metabase/visualizations/register", () => ({
  registerVisualizations: jest.fn(),
}));
jest.mock("metabase/dashboard/visualizations/register", () => ({
  registerDashboardVisualizations: jest.fn(),
}));

function createInitializedStore() {
  const store = getSdkStore();
  store.dispatch(
    initAuth.fulfilled(undefined, "test-request", {
      metabaseInstanceUrl: "http://localhost:3000",
    }),
  );
  return store;
}

const setup = ({
  dataApp,
}: { dataApp?: { name: string; isDev?: boolean } } = {}) => {
  const store = ensureMetabaseProviderPropsStore();

  store.setProps({
    authConfig: { metabaseInstanceUrl: "http://localhost:3000" },
  });
  store.updateInternalProps({ reduxStore: createInitializedStore(), dataApp });

  return renderHook(() => useInitData());
};

describe("useInitData", () => {
  const originalConfig = { ...EMBEDDING_SDK_CONFIG };
  const originalHandlers = { ...PLUGIN_API.onBeforeRequestHandlers };

  afterEach(() => {
    Object.assign(EMBEDDING_SDK_CONFIG, originalConfig);
    Object.assign(PLUGIN_API.onBeforeRequestHandlers, originalHandlers);
  });

  it("configures headers for a development data app", () => {
    // Unmount before the SDK test harness resets the provider-props store.
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
    const reduxStore = useSdkStore();
    useInitDataInternal({
      reduxStore,
      authConfig: { metabaseInstanceUrl: "http://localhost:3000" },
    });
    return <TransformName />;
  }

  function setup() {
    return renderWithProviders(<InitializedProvider />, {
      customReducers: sdkReducers,
      storeInitialState: createMockState({
        sdk: createMockSdkState({ initStatus: { status: "success" } }),
      }),
    });
  }

  beforeEach(() => {
    reinitialize();
    registerTransformQueryHooks();
    fetchMock.get("path:/api/transform/42", transform);
  });

  afterEach(() => {
    reinitialize();
    registerTransformQueryHooks();
  });

  it("loads a child's transform on the first render with an initialized store", async () => {
    const { unmount } = setup();
    expect(await screen.findByText(transform.name)).toBeInTheDocument();
    unmount();
  });

  it("loads transforms after plugins are reset between provider mounts", async () => {
    const { unmount: unmountFirst } = setup();
    expect(await screen.findByText(transform.name)).toBeInTheDocument();
    unmountFirst();

    reinitialize();
    registerTransformQueryHooks();

    const { unmount: unmountSecond } = setup();
    expect(await screen.findByText(transform.name)).toBeInTheDocument();
    unmountSecond();
  });
});
