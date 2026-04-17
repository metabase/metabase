import { act } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";
import { sdkReducers } from "embedding-sdk-bundle/store";
import { setPluginsReady } from "embedding-sdk-bundle/store/reducer";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";
import { createMockState } from "metabase-types/store/mocks";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

const setup = (
  status: LoginStatus = { status: "uninitialized" },
  pluginsReady = true,
) => {
  const state = createMockState({
    sdk: createMockSdkState({
      initStatus: createMockLoginStatusState(status),
      pluginsReady,
    }),
  });

  const jsx = (
    <PublicComponentWrapper>
      <div>My component</div>
    </PublicComponentWrapper>
  );

  return renderWithProviders(jsx, {
    storeInitialState: state,
    customReducers: sdkReducers,
  });
};

describe("PublicComponentWrapper", () => {
  it("renders loader message when loginStatus is uninitialized", () => {
    setup();
    const loader = screen.getByTestId("loading-indicator");
    expect(loader).toBeInTheDocument();
  });

  it("renders loader when loginStatus is loading", () => {
    setup({ status: "loading" });
    const loader = screen.getByTestId("loading-indicator");
    expect(loader).toBeInTheDocument();
  });

  it("renders error message when loginStatus is error", () => {
    setup({
      status: "error",
      error: { name: "Error", message: "Something went wrong" },
    });
    const errorMessage = screen.getByText("Something went wrong");
    expect(errorMessage).toBeInTheDocument();
  });

  it("renders children when loginStatus is success", () => {
    setup({ status: "success" });
    const component = screen.getByText("My component");
    expect(component).toBeInTheDocument();
  });

  describe("plugin initialization race condition (EMB-1426)", () => {
    it("shows loader when auth is done but plugins are not yet initialized", () => {
      // Simulate the race: initStatus is "success" (auth completed) but
      // pluginsReady is false (EE plugins haven't been initialized yet).
      // This happens when ComponentProvider mounts after the SDK has already
      // loaded, e.g. when a collapsible containing an iframe is first opened.
      setup({ status: "success" }, false);

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(screen.queryByText("My component")).not.toBeInTheDocument();
    });

    it("renders children once plugins are initialized", async () => {
      const { store } = setup({ status: "success" }, false);

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

      // Simulate useInitPlugins completing — dispatch is what
      // ComponentProvider does after initializePlugins() returns.
      act(() => {
        store.dispatch(setPluginsReady(true));
      });

      expect(await screen.findByText("My component")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    });
  });
});
