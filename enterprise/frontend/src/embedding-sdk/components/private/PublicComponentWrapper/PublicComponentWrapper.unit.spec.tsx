import { renderWithProviders, screen } from "__support__/ui";
import { sdkReducers } from "embedding-sdk/store";
import type { LoginStatus } from "embedding-sdk/store/types";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import { createMockState } from "metabase-types/store/mocks";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

const setup = (status: LoginStatus = { status: "uninitialized" }) => {
  const state = createMockState({
    sdk: createMockSdkState({
      loginStatus: createMockLoginStatusState(status),
    }),
  });

  renderWithProviders(
    <PublicComponentWrapper>
      <div>My component</div>
    </PublicComponentWrapper>,
    {
      storeInitialState: state,
      customReducers: sdkReducers,
    },
  );
};

describe("PublicComponentWrapper", () => {
  it("renders Initializing message when loginStatus is uninitialized", () => {
    setup();
    const message = screen.getByText("Initializing…");
    expect(message).toBeInTheDocument();
  });

  it("renders 'JWT is valid' message when loginStatus is validated", () => {
    setup({ status: "validated" });
    const message = screen.getByText("JWT is valid.");
    expect(message).toBeInTheDocument();
  });

  it("renders loader when loginStatus is loading", () => {
    setup({ status: "loading" });
    const loader = screen.getByTestId("loading-spinner");
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
