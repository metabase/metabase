import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  createMockAppState,
  createMockDashboardState,
  createMockEmbedOptions,
  createMockEmbedState,
  createMockQueryBuilderState,
  createMockStoreDashboard,
} from "__support__/state";
import { queryIcon, renderWithProviders } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { DEFAULT_INTERACTIVE_EMBEDDING_OPTIONS } from "metabase/redux/embed";
import type {
  DashboardState,
  InteractiveEmbeddingOptions,
} from "metabase/redux/store";
import { Route } from "metabase/router";
import { modelToUrl } from "metabase/urls";
import type {
  Card,
  Collection,
  TokenFeatures,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUnsavedCard,
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
        const { router } = setup({});

        if (!router) {
          throw new Error("history should be available from test setup");
        }

        expect(router.location.pathname).toBe("/question/1");
        await userEvent.click(screen.getByTestId("main-logo"));
        expect(router.location.pathname).toBe("/");
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
        const { router } = setup({});

        if (!router) {
          throw new Error("history should be available from test setup");
        }

        expect(router.location.pathname).toBe("/question/1");
        await userEvent.click(screen.getByTestId("main-logo"));
        expect(router.location.pathname).toBe("/");
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

const OFFICIAL_COLLECTION = createMockCollection({
  id: 6,
  name: "Official Collection Test",
  authority_level: "official",
  location: `/${FOO_COLLECTION.id}/`,
  effective_ancestors: [
    createMockCollection({ id: "root", name: "Our analytics" }),
    FOO_COLLECTION,
  ],
});

const OFFICIAL_DASHBOARD = createMockDashboard({
  id: 7,
  name: "Official Dashboard",
  collection_id: OFFICIAL_COLLECTION.id,
});

const OFFICIAL_QUESTION = createMockCard({
  id: 8,
  name: "Official Question",
  collection_id: OFFICIAL_COLLECTION.id,
});

describe("AppBar official collection breadcrumbs", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  // The search button needs a command palette provider outside of embedding,
  // so these tests render the app bar the way full-app embedding does.
  beforeEach(() => {
    mockEmbedding();
    matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
  });

  afterEach(() => {
    matchMediaSpy.mockReset();
    restoreMockEmbedding();
    reinitialize();
  });

  const pages = [
    {
      page: "dashboard",
      setupOpts: {
        initialRoute: `/dashboard/${OFFICIAL_DASHBOARD.id}`,
        dashboardState: {
          dashboard: createMockDashboardState({
            dashboardId: OFFICIAL_DASHBOARD.id,
            dashboards: {
              [OFFICIAL_DASHBOARD.id]: createMockStoreDashboard({
                id: OFFICIAL_DASHBOARD.id,
                name: OFFICIAL_DASHBOARD.name,
                collection_id: OFFICIAL_COLLECTION.id,
              }),
            },
          }),
        },
      },
    },
    {
      page: "question",
      setupOpts: {
        initialRoute: `/question/${OFFICIAL_QUESTION.id}`,
        card: OFFICIAL_QUESTION,
      },
    },
  ];

  const getCollectionBreadcrumb = async (name: string) =>
    screen.findByRole("link", { name: new RegExp(name) });

  it.each(pages)(
    "shows the official badge next to the official collection on the $page page",
    async ({ setupOpts }) => {
      setup({
        ...setupOpts,
        embedOptions: { breadcrumbs: true },
        collections: [FOO_COLLECTION, OFFICIAL_COLLECTION],
        tokenFeatures: { official_collections: true },
        enterprisePlugins: ["collections"],
      });

      const officialBreadcrumb = await getCollectionBreadcrumb(
        OFFICIAL_COLLECTION.name,
      );
      expect(
        await within(officialBreadcrumb).findByLabelText(
          "official_collection icon",
        ),
      ).toBeVisible();
      expect(officialBreadcrumb).toHaveAttribute(
        "href",
        "/collection/6-official-collection-test",
      );

      const regularBreadcrumb = await getCollectionBreadcrumb(
        FOO_COLLECTION.name,
      );
      expect(regularBreadcrumb).toHaveAttribute(
        "href",
        "/collection/3-foo-collection",
      );
      expect(
        within(regularBreadcrumb).getByLabelText("folder icon"),
      ).toBeInTheDocument();
      expect(
        within(regularBreadcrumb).queryByLabelText("official_collection icon"),
      ).not.toBeInTheDocument();
    },
  );

  it.each(pages)(
    "does not show the official badge without the official_collections feature on the $page page",
    async ({ setupOpts }) => {
      setup({
        ...setupOpts,
        embedOptions: { breadcrumbs: true },
        collections: [FOO_COLLECTION, OFFICIAL_COLLECTION],
        tokenFeatures: {},
        enterprisePlugins: ["collections"],
      });

      const breadcrumb = await getCollectionBreadcrumb(
        OFFICIAL_COLLECTION.name,
      );
      expect(
        within(breadcrumb).getByLabelText("folder icon"),
      ).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    },
  );
});

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});

const CARD_IN_ROOT = createMockCard({ id: 6, collection_id: null });

const CARD_IN_ROOT_DASHBOARD = createMockCard({
  id: 7,
  collection_id: null,
  dashboard_id: 4,
  dashboard: BAR_DASHBOARD,
});

describe("AppBar saved question breadcrumbs", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  beforeEach(() => {
    matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
  });

  afterEach(() => {
    matchMediaSpy.mockReset();
  });

  function getAppBar() {
    return screen.getByTestId("app-bar");
  }

  it("links a question in the root collection to the root collection", async () => {
    const { router } = setup({
      card: CARD_IN_ROOT,
      initialRoute: `/question/${CARD_IN_ROOT.id}`,
      collections: [ROOT_COLLECTION, FOO_COLLECTION],
      withKBar: true,
    });

    const rootLink = await within(getAppBar()).findByRole("link", {
      name: /Our analytics/,
    });

    await userEvent.click(rootLink);
    expect(router?.location.pathname).toBe("/collection/root");
  });

  it("links a question in a non-root collection to its collection", async () => {
    const { router } = setup({
      card: CARD_IN_COLLECTION,
      initialRoute: `/question/${CARD_IN_COLLECTION.id}`,
      collections: [ROOT_COLLECTION, FOO_COLLECTION],
      withKBar: true,
    });

    const collectionLink = await within(getAppBar()).findByRole("link", {
      name: new RegExp(FOO_COLLECTION.name),
    });

    await userEvent.click(collectionLink);
    expect(router?.location.pathname).toBe("/collection/3-foo-collection");
  });

  it("links a question in a dashboard to its dashboard, and drops the dashboard once you leave the question", async () => {
    const { router } = setup({
      card: CARD_IN_ROOT_DASHBOARD,
      initialRoute: `/question/${CARD_IN_ROOT_DASHBOARD.id}`,
      collections: [ROOT_COLLECTION, FOO_COLLECTION],
      withKBar: true,
    });

    const dashboardLink = await within(getAppBar()).findByRole("link", {
      name: new RegExp(BAR_DASHBOARD.name),
    });
    expect(
      within(getAppBar()).getByRole("link", { name: /Our analytics/ }),
    ).toBeInTheDocument();

    await userEvent.click(dashboardLink);

    expect(router?.location.pathname).toBe("/dashboard/4-bar-dashboard");
    await waitFor(() =>
      expect(
        within(getAppBar()).queryByText(BAR_DASHBOARD.name),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(getAppBar()).getByRole("link", { name: /Our analytics/ }),
    ).toBeInTheDocument();
  });
});

describe("AppBar question lineage", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  beforeEach(() => {
    matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
  });

  afterEach(() => {
    matchMediaSpy.mockReset();
  });

  it("links a changed saved question to the question it started from", async () => {
    const originalCard = createMockCard({ id: 5, name: "Cypress Pivot Table" });
    setup({
      card: createMockUnsavedCard({
        display: "table",
        dataset_query: originalCard.dataset_query,
        original_card_id: originalCard.id,
      }),
      originalCard,
      initialRoute: "/question",
      withKBar: true,
    });

    const appBar = screen.getByTestId("app-bar");
    expect(await within(appBar).findByText(/Started from/)).toBeInTheDocument();
    expect(
      within(appBar).getByRole("link", { name: "Cypress Pivot Table" }),
    ).toHaveAttribute("href", "/question/5-cypress-pivot-table");
  });

  it("shows no lineage for an unchanged saved question", async () => {
    const card = createMockCard({ id: 5, name: "Cypress Pivot Table" });
    setup({
      card,
      originalCard: card,
      initialRoute: "/question/5",
      withKBar: true,
    });

    // The lineage comes from the store alone, so it shows on the first render
    const appBar = screen.getByTestId("app-bar");
    expect(within(appBar).queryByText(/Started from/)).not.toBeInTheDocument();
    // The collection path shows in its place
    expect(
      await within(appBar).findByRole("link", { name: /Our analytics/ }),
    ).toBeInTheDocument();
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
  originalCard,
  dashboardState,
  initialRoute = "/question/1",
  collections = [FOO_COLLECTION],
  tokenFeatures,
  enterprisePlugins,
  withKBar = false,
}: {
  embedOptions?: Partial<InteractiveEmbeddingOptions>;
  card?: Card | UnsavedCard;
  originalCard?: Card;
  dashboardState?: { dashboard: DashboardState };
  initialRoute?: string;
  collections?: Collection[];
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  withKBar?: boolean;
}) {
  const settings = tokenFeatures
    ? mockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      })
    : undefined;
  enterprisePlugins?.forEach(setupEnterpriseOnlyPlugin);

  // Need to set the location because CollectionBreadcrumbs uses the useLocation()
  window.history.pushState({}, "", initialRoute);

  setupUserMetabotPermissionsEndpoint();
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });
  setupCardEndpoints(card);
  setupDashboardEndpoints(BAR_DASHBOARD);
  // the "New" button lists databases, and only shows outside embedding
  setupDatabasesEndpoints([]);

  return renderWithProviders(<Route path="*" element={<AppBarContainer />} />, {
    withRouter: true,
    withKBar,
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
        originalCard,
      }),
      ...dashboardState,
      ...(settings ? { settings } : {}),
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
