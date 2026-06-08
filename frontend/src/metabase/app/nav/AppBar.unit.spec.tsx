import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS } from "metabase/redux/embed";
import type {
  DashboardState,
  InteractiveEmbeddingOptions,
} from "metabase/redux/store";
import {
  createMockAppState,
  createMockDashboardState,
  createMockEmbedOptions,
  createMockEmbedState,
  createMockQueryBuilderState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import { modelToUrl } from "metabase/urls";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import { AppBarContainer, getSearchResultSelection } from "./AppBar";

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
const CARD_IN_RENAMED_DASHBOARD = createMockCard({
  id: 4,
  collection_id: 3,
  dashboard_id: 4,
  dashboard: createMockDashboard({
    id: 4,
    name: "Stale Dashboard Name",
    collection_id: 3,
  }),
});
const CARD_WITH_DASHBOARD_ID = createMockCard({
  id: 5,
  collection_id: 3,
  dashboard_id: 4,
  dashboard: undefined,
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

      it("should use the latest dashboard name for question breadcrumbs (#75184)", async () => {
        setup({
          embedOptions: {
            breadcrumbs: true,
          },
          card: CARD_IN_RENAMED_DASHBOARD,
        });

        expect(await screen.findByText("Bar Dashboard")).toBeInTheDocument();
        expect(
          screen.queryByText("Stale Dashboard Name"),
        ).not.toBeInTheDocument();
      });

      it("should not show dashboard breadcrumbs without dashboard context", async () => {
        setup({
          embedOptions: {
            breadcrumbs: true,
          },
          card: CARD_WITH_DASHBOARD_ID,
        });

        expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
        expect(screen.queryByText("Bar Dashboard")).not.toBeInTheDocument();
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

      it("should work for collection pages (UXW-249)", async () => {
        setup({
          initialRoute: `/collection/${FOO_COLLECTION.id}-foo-collection`,
          embedOptions: {
            breadcrumbs: true,
          },
        });

        expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
      });
    });
  });
});

describe("getSearchResultSelection", () => {
  const indexedEntity = createMockSearchResult({
    id: 42,
    model: "indexed-entity",
    model_id: 7,
    model_name: "People",
  });

  it("zooms into the row for an indexed-entity result on the current model", () => {
    expect(getSearchResultSelection(indexedEntity, 7)).toEqual({
      type: "zoom",
      objectId: 42,
    });
  });

  it("navigates for an indexed-entity result on a different model", () => {
    expect(getSearchResultSelection(indexedEntity, 9)).toEqual({
      type: "navigate",
      url: modelToUrl(indexedEntity),
    });
  });

  it("navigates when there is no current card", () => {
    expect(getSearchResultSelection(indexedEntity, undefined)).toEqual({
      type: "navigate",
      url: modelToUrl(indexedEntity),
    });
  });

  it("navigates for a non indexed-entity result even when ids match", () => {
    const card = createMockSearchResult({ id: 7, model: "card", model_id: 7 });

    expect(getSearchResultSelection(card, 7)).toEqual({
      type: "navigate",
      url: modelToUrl(card),
    });
  });
});

function setup({
  embedOptions,
  card = createMockCard(),
  dashboardState,
  initialRoute = "/question/1",
}: {
  embedOptions?: Partial<InteractiveEmbeddingOptions>;
  card?: Card;
  dashboardState?: { dashboard: DashboardState };
  initialRoute?: string;
}) {
  // Need to set the location because CollectionBreadcrumbs uses the useLocation()
  window.history.pushState({}, "", initialRoute);

  setupUserMetabotPermissionsEndpoint();
  setupCollectionsEndpoints({
    collections: [FOO_COLLECTION],
  });
  setupCollectionByIdEndpoint({ collections: [FOO_COLLECTION] });
  setupCardEndpoints(card);
  setupDashboardEndpoints(BAR_DASHBOARD);

  return renderWithProviders(<Route path="*" component={AppBarContainer} />, {
    withRouter: true,
    initialRoute,
    storeInitialState: {
      app: createMockAppState({ isNavbarOpen: false }),
      embed: createMockEmbedState({
        options: createMockEmbedOptions({
          ...DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS,
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
