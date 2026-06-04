import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("nav > containers > MainNavbar > sidebar tabs", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("defaults to the Chats tab on the home page", async () => {
    await setup({ selectAppTab: false });

    expect(screen.getByTestId("navbar-tab-chats")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("navbar-tab-app")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    // The threads list shows, while App-only content (collections) does not.
    expect(screen.getByTestId("metabot-threads-section")).toBeInTheDocument();
    expect(screen.queryByText(/Our analytics/i)).not.toBeInTheDocument();
  });

  it("reveals the main-app sections when the App tab is selected", async () => {
    await setup({ selectAppTab: false });

    await userEvent.click(screen.getByTestId("navbar-tab-app"));

    expect(await screen.findByText(/Our analytics/i)).toBeInTheDocument();
    expect(screen.getByTestId("navbar-tab-app")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("defaults to the App tab on collection routes", async () => {
    await setup({
      selectAppTab: false,
      pathname: "/collection/2",
      route: "/collection/:slug",
    });

    expect(screen.getByTestId("navbar-tab-app")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText(/Our analytics/i)).toBeInTheDocument();
  });

  it("shows the Data Studio tab for users who can access it", async () => {
    await setup({
      selectAppTab: false,
      user: createMockUser({ is_superuser: true }),
    });

    expect(screen.getByTestId("navbar-tab-data-studio")).toBeInTheDocument();
  });

  it("hides the Data Studio tab for users who cannot access it", async () => {
    await setup({
      selectAppTab: false,
      user: createMockUser({ is_superuser: false }),
    });

    expect(screen.getByTestId("navbar-tab-chats")).toBeInTheDocument();
    expect(
      screen.queryByTestId("navbar-tab-data-studio"),
    ).not.toBeInTheDocument();
  });

  it("switches to the App tab with the cmd+1 shortcut", async () => {
    await setup({ selectAppTab: false });

    await userEvent.keyboard("{Control>}1{/Control}");

    expect(await screen.findByText(/Our analytics/i)).toBeInTheDocument();
    expect(screen.getByTestId("navbar-tab-app")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches to the Chats tab with the cmd+2 shortcut", async () => {
    await setup({ selectAppTab: true });

    await userEvent.keyboard("{Control>}2{/Control}");

    expect(screen.getByTestId("navbar-tab-chats")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("metabot-threads-section")).toBeInTheDocument();
  });

  it("ignores the cmd+3 shortcut for users without Data Studio access", async () => {
    await setup({
      selectAppTab: true,
      user: createMockUser({ is_superuser: false }),
    });

    await userEvent.keyboard("{Control>}3{/Control}");

    expect(screen.getByTestId("navbar-tab-app")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
