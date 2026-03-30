import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MetabotProvider } from "../context";

import { MetabotAppBarButton } from "./MetabotAppBarButton";

function setup({
  isMetabotEnabled = true,
}: { isMetabotEnabled?: boolean } = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": isMetabotEnabled,
    "token-features": createMockTokenFeatures({ metabot_v3: true }),
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
  it("should render the button when metabot is enabled", () => {
    setup({ isMetabotEnabled: true });
    expect(
      screen.getByRole("button", { name: /Chat with Metabot/ }),
    ).toBeInTheDocument();
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Chat with Metabot/ }),
    ).not.toBeInTheDocument();
  });

  it("should toggle metabot visibility when clicked", async () => {
    const { store } = setup({ isMetabotEnabled: true });

    const initialState = store.getState() as any;
    expect(initialState.metabot.conversations.omnibot.visible).toBe(false);

    await userEvent.click(
      screen.getByRole("button", { name: /Chat with Metabot/ }),
    );

    const newState = store.getState() as any;
    expect(newState.metabot.conversations.omnibot.visible).toBe(true);
  });
});
