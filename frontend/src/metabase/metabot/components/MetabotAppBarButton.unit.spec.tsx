import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockLocation,
  createMockRoutingState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { UserMetabotPermissions } from "metabase-types/api";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";

import { MetabotAppBarButton } from "./MetabotAppBarButton";

function setup({
  isMetabotEnabled = true,
  isConfigured = true,
  permissionOverrides,
  pathname = "/",
}: {
  isMetabotEnabled?: boolean;
  isConfigured?: boolean;
  permissionOverrides?: Partial<UserMetabotPermissions>;
  pathname?: string;
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

  const TestComponent = () => (
    <MetabotProvider>
      <MetabotAppBarButton />
    </MetabotProvider>
  );

  const { store } = renderWithProviders(
    <Route path="*" component={TestComponent} />,
    {
      withRouter: true,
      initialRoute: pathname,
      storeInitialState: createMockState({
        settings,
        routing: createMockRoutingState({
          locationBeforeTransitions: createMockLocation({ pathname }),
        }),
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

  it("should disable the button on the full-page AI exploration (/question/ask) surface", async () => {
    setup({ isMetabotEnabled: true, pathname: "/question/ask" });
    expect(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    ).toBeDisabled();
  });

  it("should not disable the button on other question pages", async () => {
    setup({ isMetabotEnabled: true, pathname: "/question/123" });
    expect(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    ).toBeEnabled();
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
