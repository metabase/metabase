import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { MetabotProvider, useMetabotContext } from "metabase/metabot/context";
import {
  createMockLocation,
  createMockRoutingState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type {
  MetabotChatContext,
  UserMetabotPermissions,
} from "metabase-types/api";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";

import { AdminSettingsLayout } from "./AdminSettingsLayout";

let getChatContext: (() => Promise<MetabotChatContext>) | null = null;

const CaptureChatContext = () => {
  const context = useMetabotContext();
  getChatContext = context.getChatContext;
  return null;
};

function setup({
  isMetabotEnabled = true,
  permissionOverrides,
  pathname = "/admin/settings/general",
}: {
  isMetabotEnabled?: boolean;
  permissionOverrides?: Partial<UserMetabotPermissions>;
  pathname?: string;
} = {}) {
  getChatContext = null;
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions(permissionOverrides),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": isMetabotEnabled,
  });
  setupEnterprisePlugins();

  const TestComponent = () => (
    <MetabotProvider>
      <CaptureChatContext />
      <AdminSettingsLayout>
        <div>settings page content</div>
      </AdminSettingsLayout>
    </MetabotProvider>
  );

  renderWithProviders(<Route path="*" element={<TestComponent />} />, {
    withRouter: true,
    initialRoute: pathname,
    storeInitialState: createMockState({
      settings,
      routing: createMockRoutingState({
        locationBeforeTransitions: createMockLocation({ pathname }),
      }),
    }),
  });
}

describe("AdminSettingsLayout", () => {
  it("shows the Metabot button when the user has metabot access", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: /Chat with Metabot/ }),
    ).toBeInTheDocument();
  });

  it("does not show the Metabot button when the user lacks metabot access", async () => {
    setup({ permissionOverrides: { metabot: "no" } });
    await waitFor(() => {
      expect(screen.getByText("settings page content")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Chat with Metabot/ }),
    ).not.toBeInTheDocument();
  });

  it("does not show the Metabot button when metabot is globally disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Chat with Metabot/ }),
    ).not.toBeInTheDocument();
  });

  it("contributes the current settings section to the metabot chat context", async () => {
    setup({ pathname: "/admin/settings/authentication/google" });

    const context = await act(async () => checkNotNull(getChatContext)());

    expect(context.user_is_viewing).toEqual([
      {
        type: "admin_settings",
        section: "Google auth",
        path: "/admin/settings/authentication/google",
      },
    ]);
  });

  it("does not contribute settings context outside of admin settings", async () => {
    setup({ pathname: "/admin/people" });

    const context = await act(async () => checkNotNull(getChatContext)());

    expect(context.user_is_viewing).toEqual([]);
  });
});
