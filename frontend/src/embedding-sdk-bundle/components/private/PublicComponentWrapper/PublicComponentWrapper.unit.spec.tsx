import { renderWithProviders, screen } from "__support__/ui";
import { sdkReducers } from "embedding-sdk-bundle/store";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";
import { createMockState } from "metabase-types/store/mocks";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

const setup = (status: LoginStatus = { status: "uninitialized" }) => {
  const state = createMockState({
    sdk: createMockSdkState({
      initStatus: createMockLoginStatusState(status),
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
});
