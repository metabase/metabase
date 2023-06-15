import { Route } from "react-router";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import type { User } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import {
  createMockAppState,
  createMockState,
} from "metabase-types/store/mocks";

import Navbar from "./Navbar";

type SetupOpts = {
  isOpen?: boolean;
  route?: string;
  pathname?: string;
  user?: User | null;
};

async function setup({
  isOpen = true,
  pathname = "/",
  route = pathname,
  user = createMockUser(),
}: SetupOpts = {}) {
  const hasContentToFetch = !!user;
  const isAdminApp = pathname.startsWith("/admin");

  if (hasContentToFetch) {
    setupCollectionsEndpoints({ collections: [] });
    setupDatabasesEndpoints([createMockDatabase()]);
    fetchMock.get("path:/api/bookmark", []);
  }

  const storeInitialState = createMockState({
    app: createMockAppState({ isNavbarOpen: isOpen }),
    currentUser: user,
  });

  renderWithProviders(<Route path={route} component={Navbar} />, {
    storeInitialState,
    initialRoute: pathname,
    withRouter: true,
    withDND: true,
  });

  // Admin navbar component doesn't have a loading state
  if (hasContentToFetch && !isAdminApp) {
    await waitForElementToBeRemoved(() =>
      screen.queryAllByTestId("loading-spinner"),
    );
  }
}

describe("nav > containers > Navbar > Core App", () => {
  it("should be open when isOpen is true", async () => {
    await setup({ isOpen: true });
    const navbar = screen.getByTestId("main-navbar-root");
    expect(navbar).toHaveAttribute("aria-hidden", "false");
  });

  it("should be hidden when isOpen is false", async () => {
    await setup({ isOpen: false });
    const navbar = screen.getByTestId("main-navbar-root");
    expect(navbar).toHaveAttribute("aria-hidden", "true");
  });

  it("should not render when signed out", async () => {
    await setup({ user: null });
    expect(screen.queryByTestId("main-navbar-root")).not.toBeInTheDocument();
  });

  it("should not render when in the admin app", async () => {
    await setup({ pathname: "/admin/" });
    expect(screen.queryByTestId("main-navbar-root")).not.toBeInTheDocument();
  });
});
