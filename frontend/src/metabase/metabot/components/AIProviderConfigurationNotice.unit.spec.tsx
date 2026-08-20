import fetchMock from "fetch-mock";

import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks/metabot";

import { AIProviderConfigurationNotice } from "./AIProviderConfigurationNotice";

function setup({
  hasFeatureAccess,
  isAdmin = false,
  permissionsPending = false,
}: {
  hasFeatureAccess?: boolean;
  isAdmin?: boolean;
  permissionsPending?: boolean;
} = {}) {
  const onConfigureAi = jest.fn();

  if (permissionsPending) {
    // A delayed response keeps the hook in its loading state long enough to
    // observe it, then settles so test teardown doesn't hang.
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
      { delay: 300 },
    );
  } else {
    setupUserMetabotPermissionsEndpoint();
  }

  renderWithProviders(
    <AIProviderConfigurationNotice
      featureName="AI explorations"
      onConfigureAi={onConfigureAi}
      hasFeatureAccess={hasFeatureAccess}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "metabot-enabled?": true,
          "llm-metabot-configured?": false,
        }),
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  return { onConfigureAi };
}

describe("AIProviderConfigurationNotice", () => {
  it("prompts admins with feature access to connect to a model", async () => {
    setup({ hasFeatureAccess: true, isAdmin: true });

    expect(
      await screen.findByText(/To use AI explorations, please/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
  });

  it("asks non-admins with feature access to contact their admin", async () => {
    setup({ hasFeatureAccess: true, isAdmin: false });

    expect(
      await screen.findByText(
        "Ask your admin to connect to a model to use AI explorations.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a permission message when the user lacks feature access", async () => {
    setup({ hasFeatureAccess: false });

    expect(
      await screen.findByText(
        "You don't have permission to use AI explorations. Please contact your admin for access.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "connect to a model" }),
    ).not.toBeInTheDocument();
  });

  it("defaults to assuming feature access", async () => {
    setup({ isAdmin: false });

    expect(
      await screen.findByText(
        "Ask your admin to connect to a model to use AI explorations.",
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing while the permission query is loading (no denied-message flash)", async () => {
    setup({ hasFeatureAccess: false, permissionsPending: true });

    expect(
      screen.queryByText(/permission|connect|admin/),
    ).not.toBeInTheDocument();

    // After the query settles the real message appears.
    expect(
      await screen.findByText(/You don't have permission/),
    ).toBeInTheDocument();
  });
});
