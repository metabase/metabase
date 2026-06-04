import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { NavbarRail } from "./NavbarRail";

function setup({ metabotEnabled = false } = {}) {
  fetchMock.get("end:app/assets/img/logo.svg", "<svg></svg>");
  setupDatabasesEndpoints([createMockDatabase()]);
  setupUserMetabotPermissionsEndpoint();

  const onOpenSidebar = jest.fn();

  const { history } = renderWithProviders(
    <Route
      path="/somewhere"
      component={() => <NavbarRail onOpenSidebar={onOpenSidebar} />}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          first_name: "Sloan",
          last_name: "Sparger",
        }),
        settings: mockSettings({ "metabot-enabled?": metabotEnabled }),
      }),
      withKBar: true,
      withRouter: true,
      initialRoute: "/somewhere",
    },
  );

  return { onOpenSidebar, history };
}

describe("NavbarRail", () => {
  it("renders the new, search, and account controls", () => {
    setup();

    expect(screen.getByTestId("navbar-expand-button")).toBeInTheDocument();
    expect(screen.getByTestId("navbar-new-button")).toBeInTheDocument();
    expect(screen.getByTestId("navbar-search-button")).toBeInTheDocument();
    expect(screen.getByTestId("navbar-account-button")).toBeInTheDocument();
  });

  it("shows the current user's initials in the account avatar", () => {
    setup();

    expect(screen.getByTestId("navbar-account-button")).toHaveTextContent("SS");
  });

  it("opens the sidebar when the logo toggle is clicked", async () => {
    const { onOpenSidebar } = setup();

    await userEvent.click(screen.getByTestId("navbar-expand-button"));

    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it("hides the new-chat button without metabot access", () => {
    setup({ metabotEnabled: false });

    expect(
      screen.queryByTestId("navbar-new-chat-button"),
    ).not.toBeInTheDocument();
  });

  it("navigates to a new chat when the chat button is clicked", async () => {
    const { history } = setup({ metabotEnabled: true });

    const chatButton = await screen.findByTestId("navbar-new-chat-button");
    await userEvent.click(chatButton);

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/");
    });
  });
});
