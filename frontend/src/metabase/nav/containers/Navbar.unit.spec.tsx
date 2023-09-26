import { Route } from "react-router";
import fetchMock from "fetch-mock";
import * as dom from "metabase/lib/dom";

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
  createMockEmbedState,
  createMockState,
} from "metabase-types/store/mocks";

import Navbar from "./Navbar";

type SetupOpts = {
  isOpen?: boolean;
  route?: string;
  pathname?: string;
  user?: User | null;
  embedOptions?: Record<string, string | boolean>;
};

async function setup({
  isOpen = true,
  pathname = "/",
  route = pathname,
  user = createMockUser(),
  embedOptions = {},
}: SetupOpts = {}) {
  const hasContentToFetch = !!user;
  const isAdminApp = pathname.startsWith("/admin");

  setupCollectionsEndpoints({ collections: [] });
  setupDatabasesEndpoints([createMockDatabase()]);
  fetchMock.get("path:/api/bookmark", []);

  const storeInitialState = createMockState({
    app: createMockAppState({ isNavbarOpen: isOpen }),
    embed: createMockEmbedState(embedOptions),
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

  describe("embedded", () => {
    let isWithinIframeSpy: jest.SpyInstance;

    beforeAll(() => {
      isWithinIframeSpy = jest.spyOn(dom, "isWithinIframe");
      isWithinIframeSpy.mockReturnValue(true);
    });

    afterAll(() => {
      isWithinIframeSpy.mockRestore();
    });

    const normallyHiddenRoutes = ["/model/1", "/dashboard/1", "/question/1"];
    const normallyVisibleRoutes = ["/"];
    const allRoutes = [...normallyHiddenRoutes, ...normallyVisibleRoutes];

    allRoutes.forEach(route => {
      it(`should be visible when embedded and on ${route} top_nav=false&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: false, // this should be ignored and overridden by the embedding params
          embedOptions: { top_nav: false, side_nav: true },
        });

        const navbar = screen.getByTestId("main-navbar-root");
        expect(navbar).toHaveAttribute("aria-hidden", "false");
      });
    });

    normallyVisibleRoutes.forEach(route => {
      it(`should be visible when embedded and on ${route} top_nav=true&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: true,
          embedOptions: { top_nav: true, side_nav: true },
        });

        const navbar = screen.getByTestId("main-navbar-root");
        expect(navbar).toHaveAttribute("aria-hidden", "false");
      });
    });

    normallyHiddenRoutes.forEach(route => {
      it(`should not be visible when embedded and on ${route} top_nav=true&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: false,
          embedOptions: { top_nav: true, side_nav: true },
        });

        const navbar = screen.getByTestId("main-navbar-root");
        expect(navbar).toHaveAttribute("aria-hidden", "true");
      });
    });

    normallyHiddenRoutes.forEach(route => {
      it(`should not be visible when embedded and on ${route} top_nav=true&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: false,
          embedOptions: { top_nav: true, side_nav: true },
        });

        const navbar = screen.getByTestId("main-navbar-root");
        expect(navbar).toHaveAttribute("aria-hidden", "true");
      });
    });

    // the current state of App.tsx is such that this should never even happen because we don't even render the parent component
    // but this test will cover any future changes in the component tree
    allRoutes.forEach(route => {
      it(`should not be visible when embedded and on ${route} with side_nav=false`, async () => {
        await setup({
          pathname: route,
          isOpen: false,
          embedOptions: { side_nav: false },
        });

        const navbar = screen.getByTestId("main-navbar-root");
        expect(navbar).toHaveAttribute("aria-hidden", "true");
      });
    });
  });
});
