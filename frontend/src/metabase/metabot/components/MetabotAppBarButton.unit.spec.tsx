import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
import type { UserMetabotPermissions } from "metabase-types/api";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { MetabotProvider } from "../context";

import { MetabotAppBarButton } from "./MetabotAppBarButton";

interface SetupOpts {
  isMetabotEnabled?: boolean;
  isConfigured?: boolean;
  permissionOverrides?: Partial<UserMetabotPermissions>;
  pathname?: string;
  metabotName?: string;
  metabotIcon?: string;
}

function setup({
  isMetabotEnabled = true,
  isConfigured = true,
  permissionOverrides,
  pathname = "/",
  metabotName = "Metabot",
  metabotIcon = "metabot",
}: SetupOpts = {}) {
  fetchMock.get(
    "path:/api/metabot/permissions/user-permissions",
    createMockUserMetabotPermissions(permissionOverrides),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": isMetabotEnabled,
    "metabot-name": metabotName,
    "metabot-icon": metabotIcon,
  });
  setupEnterprisePlugins();

  const TestComponent = () => (
    <MetabotProvider>
      <MetabotAppBarButton />
    </MetabotProvider>
  );

  const { store } = renderWithProviders(
    <Route path="*" element={<TestComponent />} />,
    {
      withRouter: true,
      initialRoute: pathname,
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

  it.each([
    "/question/ask",
    "/question/ask/",
    "/metabot/conversation/past-conversation-id",
  ])(
    "should disable the button on the full-page metabot surface (%s)",
    async (pathname) => {
      setup({ isMetabotEnabled: true, pathname });
      expect(
        await screen.findByRole("button", { name: /Chat with Metabot/ }),
      ).toBeDisabled();
    },
  );

  it("should not disable the button on other question pages", async () => {
    setup({ isMetabotEnabled: true, pathname: "/question/123" });
    expect(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    ).toBeEnabled();
  });

  it("should toggle metabot visibility when clicked", async () => {
    const { store } = setup({ isMetabotEnabled: true });

    // Unjustified type cast. FIXME
    const initialState = store.getState() as any;
    expect(initialState.metabot.agents.omnibot.visible).toBe(false);

    await userEvent.click(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    );

    // Unjustified type cast. FIXME
    const newState = store.getState() as any;
    expect(newState.metabot.agents.omnibot.visible).toBe(true);
  });

  it("should track opening the chat from the header, but not closing it", async () => {
    const trackEvent = jest.mocked(Analytics.trackSimpleEvent);
    trackEvent.mockClear();
    setup();
    const button = await screen.findByRole("button", {
      name: /Chat with Metabot/,
    });

    await userEvent.click(button);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({
      event: "metabot_chat_opened",
      triggered_from: "header",
    });

    await userEvent.click(button);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("should use the custom metabot name and icon", async () => {
    setup({
      metabotName: "HAL 9000",
      metabotIcon: "data:image/png;base64,iVBORw0KGgo=",
    });

    const button = await screen.findByRole("button", {
      name: /Chat with HAL 9000/,
    });
    expect(
      within(button).getByRole("img", { name: "HAL 9000" }),
    ).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
  });
});
