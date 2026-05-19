import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { UserMetabotPermissions } from "metabase-types/api";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";

import { MetabotAppBarButton } from "./MetabotAppBarButton";

function setup({
  isMetabotEnabled = true,
  isConfigured = true,
  permissionOverrides,
}: {
  isMetabotEnabled?: boolean;
  isConfigured?: boolean;
  permissionOverrides?: Partial<UserMetabotPermissions>;
} = {}) {
  fetchMock.get(
    "path:/api/metabot/permissions/user-permissions",
    createMockUserMetabotPermissions(permissionOverrides),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": isMetabotEnabled,
  });
  setupEnterprisePlugins();

  const { store } = renderWithProviders(
    <MetabotProvider>
      <MetabotAppBarButton />
    </MetabotProvider>,
    {
      storeInitialState: createMockState({
        settings,
      }),
    },
  );

  return { store };
}

describe("MetabotAppBarButton", () => {
  it("should render the button when metabot is enabled", async () => {
    setup({ isMetabotEnabled: true });
    expect(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    ).toBeInTheDocument();
  });

  it("should render the button when metabot is enabled but not configured", async () => {
    setup({ isConfigured: false, isMetabotEnabled: true });
    expect(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    ).toBeInTheDocument();
  });

  it("should not render the button when metabot is globally disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Chat with Metabot/ }),
    ).not.toBeInTheDocument();
  });

  it("should not render the button when user lacks metabot permission", async () => {
    setup({ permissionOverrides: { metabot: "no" } });
    // Wait for the API response to be processed
    await waitFor(() => {
      expect(fetchMock.callHistory.calls().length).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("button", { name: /Chat with Metabot/ }),
    ).not.toBeInTheDocument();
  });

  it("should toggle metabot visibility when clicked", async () => {
    const { store } = setup({ isMetabotEnabled: true });

    const initialState = store.getState() as any;
    expect(initialState.metabot.conversations.omnibot.visible).toBe(false);

    await userEvent.click(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    );

    const newState = store.getState() as any;
    expect(newState.metabot.conversations.omnibot.visible).toBe(true);
  });
});
