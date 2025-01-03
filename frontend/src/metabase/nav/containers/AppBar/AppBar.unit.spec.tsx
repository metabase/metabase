import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { DEFAULT_EMBED_OPTIONS } from "metabase/redux/embed";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";
import type { DashboardState, EmbedOptions } from "metabase-types/store";
import {
  createMockAppState,
  createMockDashboardState,
  createMockEmbedOptions,
  createMockEmbedState,
  createMockQueryBuilderState,
  createMockStoreDashboard,
} from "metabase-types/store/mocks";

import AppBar from "./AppBar";

const FOO_COLLECTION = createMockCollection({
  id: 3,
  name: "Foo Collection",
});

const BAR_DASHBOARD = createMockDashboard({
  id: 4,
  name: "Bar Dashboard",
  collection_id: 3,
});

const CARD_IN_COLLECTION = createMockCard({ id: 2, collection_id: 3 });
const CARD_IN_DASHBOARD = createMockCard({
  id: 3,
  collection_id: 3,
  dashboard_id: 4,
  dashboard: BAR_DASHBOARD,
});

describe("AppBar", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  describe("full-app embedding", () => {
    beforeEach(async () => {
      mockEmbedding();
    });

    afterEach(() => {
      jest.clearAllMocks();
      restoreMockEmbedding();
    });

    describe("large screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
      });

      it("should be able to toggle side nav", async () => {
        setup({
          embedOptions: {
            side_nav: true,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        setup({
          embedOptions: {
            side_nav: false,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should always show side nav toggle icon when logo is hidden", async () => {
        setup({
          embedOptions: {
            side_nav: true,
            logo: false,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();
      });

      it("should not show either logo or side nav toggle button at all", async () => {
        setup({
          embedOptions: {
            side_nav: false,
            logo: false,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should take you home when clicking the logo", async () => {
        const { history } = setup({});

        if (!history) {
          throw new Error("history should be available from test setup");
        }

        expect(history.getCurrentLocation().pathname).toBe("/question/1");
        await userEvent.click(screen.getByTestId("main-logo"));
        expect(history.getCurrentLocation().pathname).toBe("/");
      });
    });

    describe("small screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: true }));
      });

      it("should be able to toggle side nav", async () => {
        setup({
          embedOptions: {
            side_nav: true,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument();
        expect(screen.getByTestId("main-logo")).toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        setup({
          embedOptions: {
            side_nav: false,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should always show side nav toggle icon when logo is hidden", async () => {
        setup({
          embedOptions: {
            side_nav: true,
            logo: false,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();
      });

      it("should not show either logo or side nav toggle button at all", async () => {
        setup({
          embedOptions: {
            side_nav: false,
            logo: false,
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should take you home when clicking the logo", async () => {
        const { history } = setup({});

        if (!history) {
          throw new Error("history should be available from test setup");
        }

        expect(history.getCurrentLocation().pathname).toBe("/question/1");
        await userEvent.click(screen.getByTestId("main-logo"));
        expect(history.getCurrentLocation().pathname).toBe("/");
      });
    });

    describe("breadcrumbs", () => {
      it("should work for questions in collections", async () => {
        setup({
          embedOptions: {
            breadcrumbs: true,
          },
          card: CARD_IN_COLLECTION,
        });

        expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
      });

      it("should work for questions in dashboards", async () => {
        setup({
          embedOptions: {
            breadcrumbs: true,
          },
          card: CARD_IN_DASHBOARD,
        });

        expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
        expect(await screen.findByText("Bar Dashboard")).toBeInTheDocument();
      });

      it("should work for dashboards", async () => {
        setup({
          initialRoute: `/dashboard/${BAR_DASHBOARD.id}`,
          embedOptions: {
            breadcrumbs: true,
          },
          dashboardState: {
            dashboard: createMockDashboardState({
              dashboardId: BAR_DASHBOARD.id,
              dashboards: {
                [BAR_DASHBOARD.id]: createMockStoreDashboard({
                  id: BAR_DASHBOARD.id,
                  collection_id: FOO_COLLECTION.id,
                }),
              },
            }),
          },
        });

        expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
      });
    });
  });
});

function setup({
  embedOptions,
  card = createMockCard(),
  dashboardState,
  initialRoute = "/question/1",
}: {
  embedOptions?: Partial<EmbedOptions>;
  card?: Card;
  dashboardState?: { dashboard: DashboardState };
  initialRoute?: string;
}) {
  // Need to set the location because CollectionBreadcrumbs uses the useLocation()
  window.history.pushState({}, "", initialRoute);

  setupCollectionsEndpoints({
    collections: [FOO_COLLECTION],
  });
  setupCollectionByIdEndpoint({ collections: [FOO_COLLECTION] });
  setupCardEndpoints(card);
  setupDashboardEndpoints(BAR_DASHBOARD);

  return renderWithProviders(<Route path="*" component={AppBar} />, {
    withRouter: true,
    initialRoute,
    storeInitialState: {
      app: createMockAppState({ isNavbarOpen: false }),
      embed: createMockEmbedState({
        options: createMockEmbedOptions({
          ...DEFAULT_EMBED_OPTIONS,
          ...embedOptions,
        }),
      }),
      qb: createMockQueryBuilderState({
        card,
      }),
      ...dashboardState,
    },
  });
}

function getMediaQuery(opts?: Partial<MediaQueryList>): MediaQueryList {
  return {
    media: "",
    matches: false,
    onchange: jest.fn(),
    dispatchEvent: jest.fn(),
    addListener: jest.fn(),
    addEventListener: jest.fn(),
    removeListener: jest.fn(),
    removeEventListener: jest.fn(),
    ...opts,
  };
}

const windowSelf = window.self;
function mockEmbedding() {
  Object.defineProperty(window, "self", {
    value: {},
  });
}

function restoreMockEmbedding() {
  Object.defineProperty(window, "self", {
    value: windowSelf,
  });
}
