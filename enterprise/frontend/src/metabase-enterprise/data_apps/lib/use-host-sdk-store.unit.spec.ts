import { renderHook } from "@testing-library/react";

import { getSdkStore } from "embedding-sdk-bundle/store";
import { initAuth } from "embedding-sdk-bundle/store/auth/auth";
import { setPluginsReady } from "embedding-sdk-bundle/store/reducer";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

import { useHostSdkStore } from "./use-host-sdk-store";

jest.mock("embedding-sdk-bundle/store", () => ({ getSdkStore: jest.fn() }));
jest.mock("embedding-sdk-bundle/store/auth/auth", () => ({
  initAuth: { fulfilled: { type: "sdk/initAuth/fulfilled" } },
}));
jest.mock("embedding-sdk-bundle/store/reducer", () => ({
  setPluginsReady: jest.fn((ready: boolean) => ({
    type: "sdk/setPluginsReady",
    payload: ready,
  })),
}));
jest.mock(
  "embedding-sdk-shared/lib/ensure-metabase-provider-props-store",
  () => ({
    ensureMetabaseProviderPropsStore: jest.fn(),
  }),
);

const mockedGetSdkStore = jest.mocked(getSdkStore);
const mockedEnsurePropsStore = jest.mocked(ensureMetabaseProviderPropsStore);

const setup = (initialProps: Record<string, unknown> = {}) => {
  const dispatch = jest.fn();
  const store = { dispatch } as unknown as ReturnType<typeof getSdkStore>;
  mockedGetSdkStore.mockReturnValue(store);

  const setProps = jest.fn();
  const updateInternalProps = jest.fn();
  mockedEnsurePropsStore.mockReturnValue({
    setProps,
    updateInternalProps,
  } as unknown as ReturnType<typeof ensureMetabaseProviderPropsStore>);

  const utils = renderHook(({ props }) => useHostSdkStore(props), {
    initialProps: { props: initialProps },
  });

  return { store, dispatch, setProps, updateInternalProps, ...utils };
};

describe("useHostSdkStore", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns a single SDK store that stays stable across renders", () => {
    const { result, rerender, store } = setup();

    // Re-render with a changed prop: the store must stay the same instance.
    rerender({ props: { theme: { colors: {} } } });

    expect(result.current).toBe(store);
    expect(mockedGetSdkStore).toHaveBeenCalledTimes(1);
  });

  it("marks the SDK store loaded and resolves auth exactly once", () => {
    const { rerender, store, dispatch, updateInternalProps } = setup();

    rerender({ props: {} });

    expect(updateInternalProps).toHaveBeenCalledTimes(1);
    expect(updateInternalProps).toHaveBeenCalledWith({
      reduxStore: store,
      loadingState: SdkLoadingState.Loaded,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: initAuth.fulfilled.type });
    expect(dispatch).toHaveBeenCalledWith(setPluginsReady(true));
  });

  it("forwards the host auth config and the caller's props into the props store", () => {
    const theme = { colors: {} };
    const { setProps } = setup({ theme });

    expect(setProps).toHaveBeenCalledWith({
      authConfig: {
        isGuest: false,
        metabaseInstanceUrl: "http://localhost",
      },
      theme,
    });
  });
});
