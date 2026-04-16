import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { UserMetabotPermissions } from "metabase-types/api";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";

import { MetabotAppBarButton } from "./MetabotAppBarButton";

function setup({
  isMetabotEnabled = true,
  permissionOverrides,
}: {
  isMetabotEnabled?: boolean;
  permissionOverrides?: Partial<UserMetabotPermissions>;
} = {}) {
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions(permissionOverrides),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": true,
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

  it("should not render the button when metabot is globally disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Chat with Metabot/ }),
    ).not.toBeInTheDocument();
  });

  it("should not render the button when user lacks metabot permission", async () => {
    setup({ permissionOverrides: { metabot: "no" } });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Chat with Metabot/ }),
      ).not.toBeInTheDocument();
    });
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
