import userEvent from "@testing-library/user-event";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { Route } from "metabase/router";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { NotificationConfigBanner } from "./NotificationConfigBanner";

interface SetupOpts {
  emailConfigured?: boolean;
  slackConfigured?: boolean;
  onConfigureClick?: () => void;
}

function setup({
  emailConfigured = false,
  slackConfigured = false,
  onConfigureClick = () => {},
}: SetupOpts = {}) {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: true,
    hosting: false,
  });

  setupNotificationChannelsEndpoints({
    email: { configured: emailConfigured },
    slack: { configured: slackConfigured },
  });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": tokenFeatures,
    }),
  });

  renderWithProviders(
    <Route
      path="*"
      element={<NotificationConfigBanner onConfigureClick={onConfigureClick} />}
    />,
    {
      initialRoute: "/",
      storeInitialState: state,
      withRouter: true,
    },
  );
}

describe("NotificationConfigBanner", () => {
  it(`renders if notifications are not configured`, async () => {
    setup();

    expect(
      await screen.findByText(/Configure notifications/),
    ).toBeInTheDocument();
  });
  it(`does not render if email is configured`, async () => {
    setup({ emailConfigured: true });

    await waitForRequestsToSettle();
    expect(
      screen.queryByText(/Configure notifications/),
    ).not.toBeInTheDocument();
  });
  it(`does not render if slack is configured`, async () => {
    setup({ slackConfigured: true });

    await waitForRequestsToSettle();
    expect(
      screen.queryByText(/Configure notifications/),
    ).not.toBeInTheDocument();
  });
  it(`has a Configure button`, async () => {
    const onConfigureClick = jest.fn();
    setup({ onConfigureClick });

    await userEvent.click(
      await screen.findByRole("button", { name: /Configure/i }),
    );
    expect(onConfigureClick).toHaveBeenCalledTimes(1);
  });
});
