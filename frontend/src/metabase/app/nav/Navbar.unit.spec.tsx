import type { Store } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupGdriveGetFolderEndpoint,
  setupSearchEndpoints,
  setupSettingEndpoint,
} from "__support__/server-mocks";
import {
  createMockAppState,
  createMockDashboardState,
  createMockEmbedOptions,
  createMockEmbedState,
  createMockState,
} from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { CLOSE_NAVBAR, OPEN_NAVBAR } from "metabase/redux/app";
import type { DashboardState, State } from "metabase/redux/store";
import { Route } from "metabase/router";
import * as iframeUtils from "metabase/utils/iframe";
import type { Collection, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import { Navbar } from "./Navbar";

type SetupOpts = {
  isOpen?: boolean;
  route?: string;
  pathname?: string;
  user?: User | null;
  embedOptions?: Record<string, string | boolean>;
  collections?: Collection[];
  trashCollection?: Collection;
  dashboardState?: DashboardState;
};

async function setup({
  isOpen,
  pathname = "/",
  route = pathname,
  user = createMockUser(),
  embedOptions = {},
  collections = [],
  trashCollection,
  dashboardState,
}: SetupOpts = {}) {
  setupCollectionsEndpoints({ collections, trashCollection });
  setupDatabasesEndpoints([createMockDatabase()]);
  setupSearchEndpoints([]);
  setupCollectionItemsEndpoint({
    collection: createMockCollection(ROOT_COLLECTION),
    collectionItems: [],
  });
  setupGdriveGetFolderEndpoint({ status: "active" });
  fetchMock.get("path:/api/bookmark", []);

  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: {},
  });

  const storeInitialState = createMockState({
    app: createMockAppState({
      isNavbarOpen: isOpen ?? true,
    }),
    embed: createMockEmbedState({
      options: createMockEmbedOptions(embedOptions),
    }),
    currentUser: user,
    ...(dashboardState ? { dashboard: dashboardState } : {}),
  });

  const { store } = renderWithProviders(
    <Route path={route} element={<Navbar />} />,
    {
      storeInitialState,
      initialRoute: pathname,
      withRouter: true,
      withDND: true,
    },
  );

  // manually dispatch the location event that the router history sync would otherwise dispatch for us
  dispatchLocationChange({ store, initialRoute: true, pathname });

  await waitForLoaderToBeRemoved();

  return store;
}

describe("nav > containers > Navbar > Core App", () => {
  it("should be open when isOpen is true", async () => {
    await setup({ isOpen: true });
    await expectNavbarOpen();
  });

  it("should be hidden when isOpen is false", async () => {
    await setup({ isOpen: false });
    await expectNavbarClosed();
  });

  it("should not render when signed out", async () => {
    await setup({ user: null });
    expect(screen.queryByTestId("main-navbar-root")).not.toBeInTheDocument();
  });

  it("should not render when in the admin app", async () => {
    await setup({ pathname: "/admin/" });
    expect(screen.queryByTestId("main-navbar-root")).not.toBeInTheDocument();
  });

  ["question/1", "model/1", "dashboard/1"].forEach((pathname) => {
    it(`should be open on initial load for a ${pathname}`, async () => {
      await setup({ pathname: `/${pathname}` });
      await expectNavbarOpen();
    });
  });

  it("should stay open when visiting a question", async () => {
    const store = await setup({ pathname: "/" });
    await expectNavbarOpen();
    dispatchLocationChange({ store, pathname: "/question/1" });
    await expectNavbarOpen();
  });

  it("should stay closed when visiting a question after being closed manually", async () => {
    const store = await setup({ isOpen: false, pathname: "/collection/1" });
    await expectNavbarClosed();
    dispatchLocationChange({ store, pathname: "/question/1" });
    await expectNavbarClosed();
  });

  it("should not close navbar when preserveNavbarState is set", async () => {
    const store = await setup({ isOpen: true });
    await expectNavbarOpen();
    // act(...) flushes the connected Navbar re-render caused by the dispatch
    act(() => {
      store.dispatch({
        type: "@@router/LOCATION_CHANGE",
        payload: {
          pathname: "/question/1",
          state: { preserveNavbarState: true },
        },
      });
    });
    await expectNavbarOpen();
  });

  it("should only change state on explicit open/close actions, not navigation", async () => {
    const store = await setup({ pathname: "/collection/1" });
    await expectNavbarOpen();
    dispatchLocationChange({ store, pathname: "/collection/2" });
    await expectNavbarOpen();
    dispatchLocationChange({ store, pathname: "/question/1" });
    await expectNavbarOpen();
    dispatchLocationChange({ store, pathname: "/dashboard/1" });
    await expectNavbarOpen();
    // act(...) flushes the connected Navbar re-render caused by the dispatch
    act(() => {
      store.dispatch({ type: CLOSE_NAVBAR });
    });
    await expectNavbarClosed();
    dispatchLocationChange({ store, pathname: "/collection/3" });
    await expectNavbarClosed();
    dispatchLocationChange({ store, pathname: "/question/2" });
    await expectNavbarClosed();
    act(() => {
      store.dispatch({ type: OPEN_NAVBAR });
    });
    await expectNavbarOpen();
    dispatchLocationChange({ store, pathname: "/collection/4" });
    await expectNavbarOpen();
  });

  describe("trash highlight on a dashboard", () => {
    const DASHBOARD_ID = 42;
    const dashboardCollection = createMockCollection({
      id: 2,
      name: "Dashboard collection",
    });
    const trashCollection = createMockCollection({
      id: 20000000,
      name: "Trash",
      type: "trash",
    });

    function setupDashboardPage({ archived }: { archived: boolean }) {
      const dashboard = createMockDashboard({
        id: DASHBOARD_ID,
        collection_id: Number(dashboardCollection.id),
        archived,
      });
      return setup({
        route: "/dashboard/:slug",
        pathname: `/dashboard/${DASHBOARD_ID}`,
        collections: [dashboardCollection],
        trashCollection,
        dashboardState: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          dashboards: {
            [DASHBOARD_ID]: { ...dashboard, dashcards: [] },
          },
        }),
      });
    }

    const getTrashItem = () => screen.getByRole("treeitem", { name: /Trash/ });
    const getDashboardCollectionItem = () =>
      screen.getByRole("treeitem", { name: /Dashboard collection/ });

    it("should highlight the dashboard's collection when the dashboard in the store is not archived", async () => {
      await setupDashboardPage({ archived: false });

      await waitFor(() => {
        expect(getDashboardCollectionItem()).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
      expect(getTrashItem()).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight the trash when the dashboard in the store is archived", async () => {
      await setupDashboardPage({ archived: true });

      await waitFor(() => {
        expect(getTrashItem()).toHaveAttribute("aria-selected", "true");
      });
      expect(getDashboardCollectionItem()).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });
  });

  describe("embedded", () => {
    let isWithinIframeSpy: jest.SpyInstance;

    beforeAll(() => {
      isWithinIframeSpy = jest.spyOn(iframeUtils, "isWithinIframe");
      isWithinIframeSpy.mockReturnValue(true);
    });

    afterAll(() => {
      isWithinIframeSpy.mockRestore();
    });

    const normallyHiddenRoutes = ["/model/1", "/dashboard/1", "/question/1"];
    const normallyVisibleRoutes = ["/"];
    const allRoutes = [...normallyHiddenRoutes, ...normallyVisibleRoutes];

    allRoutes.forEach((route) => {
      it(`should be visible when embedded and on ${route} top_nav=false&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: false, // this should be ignored and overridden by the embedding params
          embedOptions: { top_nav: false, side_nav: true },
        });
        await expectNavbarOpen();
      });
    });

    normallyVisibleRoutes.forEach((route) => {
      it(`should be visible when embedded and on ${route} top_nav=true&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: true,
          embedOptions: { top_nav: true, side_nav: true },
        });
        await expectNavbarOpen();
      });
    });

    normallyHiddenRoutes.forEach((route) => {
      it(`should not be visible when embedded and on ${route} top_nav=true&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: false,
          embedOptions: { top_nav: true, side_nav: true },
        });
        await expectNavbarClosed();
      });
    });

    normallyHiddenRoutes.forEach((route) => {
      it(`should not be visible when embedded and on ${route} top_nav=true&side_nav=true`, async () => {
        await setup({
          pathname: route,
          isOpen: false,
          embedOptions: { top_nav: true, side_nav: true },
        });
        await expectNavbarClosed();
      });
    });

    // the current state of AppComponent.tsx is such that this should never even happen because we don't even render the parent component
    // but this test will cover any future changes in the component tree
    allRoutes.forEach((route) => {
      it(`should not be visible when embedded and on ${route} with side_nav=false`, async () => {
        await setup({
          pathname: route,
          isOpen: false,
          embedOptions: { side_nav: false },
        });
        await expectNavbarClosed();
      });
    });
  });
});

async function expectNavbarOpen() {
  const navbar = await screen.findByTestId("main-navbar-root");
  expect(navbar).toBeVisible();
  expect(navbar).toHaveAttribute("aria-hidden", "false");
}

async function expectNavbarClosed() {
  const navbar = await screen.findByTestId("main-navbar-root");
  expect(navbar).not.toBeVisible();
  expect(navbar).toHaveAttribute("aria-hidden", "true");
}

interface DispatchLocationChangeParams {
  store: Store<State>;
  initialRoute?: boolean;
  pathname: string;
}

function dispatchLocationChange({
  store,
  initialRoute = false,
  pathname,
}: DispatchLocationChangeParams) {
  // The dispatch synchronously re-renders the connected Navbar; wrap it in
  // act(...) so React's state updates are flushed within the test instead
  // of leaking past it.
  act(() => {
    store.dispatch({
      type: "@@router/LOCATION_CHANGE",
      payload: {
        pathname,
        action: initialRoute ? "POP" : "PUSH",
      },
    });
  });
}
