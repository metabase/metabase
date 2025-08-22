import userEvent from "@testing-library/user-event";

import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/hoc/Title";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotPurchasePage } from "./MetabotPurchasePage";

const setup = async ({
  current_user_matches_store_user,
}: {
  current_user_matches_store_user: boolean;
}) => {
  const settings = createMockSettings({
    "token-status": {
      status: "",
      valid: true,
      "store-users": current_user_matches_store_user
        ? [{ email: "user@example.com" }]
        : [],
    },
  });
  setupPropertiesEndpoints(settings);

  const user = createMockUser({ email: "user@example.com" });
  setupCurrentUserEndpoint(user);

  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotPurchasePage} />,
    {
      withRouter: true,
      initialRoute: `/admin/metabot`,
      // Calling `setupPropertiesEndpoints` above is not enough; we also need to set `storeInitialState`:
      storeInitialState: {
        settings: createMockSettingsState(settings),
        currentUser: user,
      },
    },
  );
};

describe("MetabotPurchasePage", () => {
  it("shows empty state alternate text when current user is not a store user", () => {
    setup({ current_user_matches_store_user: false });
    expect(screen.getByText(/Get a free month of Metabot/)).toBeInTheDocument();
    expect(
      screen.getByText(/Please ask a Metabase Store Admin/),
    ).toBeInTheDocument();
  });

  it("requires Terms of Service to be accepted", async () => {
    await setup({
      current_user_matches_store_user: true,
    });
    expect(
      screen.queryByText(/Please ask a Metabase Store Admin/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    ).toBeEnabled();
  });
});
