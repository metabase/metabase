import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { AIProviderConfigurationNotice } from "./AIProviderConfigurationNotice";

function setup({
  hasFeatureAccess,
  isAdmin = false,
}: {
  hasFeatureAccess?: boolean;
  isAdmin?: boolean;
} = {}) {
  const onConfigureAi = jest.fn();

  renderWithProviders(
    <AIProviderConfigurationNotice
      featureName="AI explorations"
      onConfigureAi={onConfigureAi}
      hasFeatureAccess={hasFeatureAccess}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  return { onConfigureAi };
}

describe("AIProviderConfigurationNotice", () => {
  it("prompts admins with feature access to connect to a model", () => {
    setup({ hasFeatureAccess: true, isAdmin: true });

    expect(
      screen.getByText(/To use AI explorations, please/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
  });

  it("asks non-admins with feature access to contact their admin", () => {
    setup({ hasFeatureAccess: true, isAdmin: false });

    expect(
      screen.getByText(
        "Ask your admin to connect to a model to use AI explorations.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a permission message when the user lacks feature access", () => {
    setup({ hasFeatureAccess: false });

    expect(
      screen.getByText(
        "You don't have permission to use AI explorations. Please contact your admin for access.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "connect to a model" }),
    ).not.toBeInTheDocument();
  });

  it("defaults to assuming feature access", () => {
    setup({ isAdmin: false });

    expect(
      screen.getByText(
        "Ask your admin to connect to a model to use AI explorations.",
      ),
    ).toBeInTheDocument();
  });
});
