import { renderWithProviders, screen } from "__support__/ui";
import { sdkReducers } from "embedding-sdk/store";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk/test/mocks/state";
import type { SdkUsageProblem } from "embedding-sdk/types/usage-problem";
import type { LoginStatus } from "embedding-sdk/types/user";
import { createMockState } from "metabase-types/store/mocks";

import { SdkContextProvider } from "../SdkContext";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

const setup = (
  status: LoginStatus = { status: "uninitialized" },
  {
    insideProvider = true,
    usageProblem,
  }: { insideProvider?: boolean; usageProblem?: SdkUsageProblem } = {},
) => {
  const state = createMockState({
    sdk: createMockSdkState({
      loginStatus: createMockLoginStatusState(status),
      usageProblem,
    }),
  });

  const jsx = insideProvider ? (
    <SdkContextProvider>
      <PublicComponentWrapper>
        <div>My component</div>
      </PublicComponentWrapper>
    </SdkContextProvider>
  ) : (
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
  it("renders Initializing message when loginStatus is uninitialized", () => {
    setup();
    const message = screen.getByText("Initializing…");
    expect(message).toBeInTheDocument();
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

  it("should not render children when rendered outside of the provider (metabase#50736)", () => {
    setup({ status: "success" }, { insideProvider: false });
    const component = screen.queryByText("My component");
    expect(component).not.toBeInTheDocument();
  });

  it("should render error message when usageProblem contains an error", () => {
    const errorMessage = "This error should be shown on the page.";

    setup(
      { status: "success" },
      {
        usageProblem: {
          type: "API_KEYS_WITHOUT_LICENSE",
          title: "API Keys without License",
          documentationUrl:
            "https://www.metabase.com/docs/latest/embedding/sdk/introduction",
          severity: "error",
          message: errorMessage,
        },
      },
    );

    expect(screen.getByText(errorMessage)).toBeVisible();
  });
});
