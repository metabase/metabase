import { Route } from "react-router";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCardsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";

import * as Urls from "metabase/lib/urls";

import { ROOT_COLLECTION } from "metabase/entities/collections";

import type { Card, Dashboard, DashboardId, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  createMockState,
  createMockDashboardState,
  createMockQueryBuilderState,
} from "metabase-types/store/mocks";

import type { DashboardState } from "metabase-types/store";
import MainNavbar from "./MainNavbar";

type SetupOpts = {
  pathname?: string;
  route?: string;
  user?: User | null;
  hasDataAccess?: boolean;
  hasOwnDatabase?: boolean;
  openQuestionCard?: Card;
  openDashboard?: Dashboard;
};

const PERSONAL_COLLECTION_BASE = createMockCollection({
  id: 1,
  name: "'Your personal collection",
  originalName: "John's Personal Collection",
});

const TEST_COLLECTION = createMockCollection({
  id: 2,
  name: "Test collection",
});

const SAMPLE_DATABASE = createMockDatabase({
  id: 1,
  name: "Sample Database",
  is_sample: true,
});

const USER_DATABASE = createMockDatabase({
  id: 2,
  name: "User Database",
  is_sample: false,
});

async function setup({
  pathname = "/",
  route = pathname,
  user = createMockUser(),
  hasDataAccess = true,
  hasOwnDatabase = true,
  openDashboard,
  openQuestionCard,
}: SetupOpts = {}) {
  const databases = [];
  const collections = [TEST_COLLECTION];

  if (hasDataAccess) {
    databases.push(SAMPLE_DATABASE);

    if (hasOwnDatabase) {
      databases.push(USER_DATABASE);
    }
  }

  const personalCollection = user
    ? createMockCollection({
        ...PERSONAL_COLLECTION_BASE,
        personal_owner_id: user.id,
      })
    : null;

  if (personalCollection && user) {
    user.personal_collection_id = 1;
    collections.push(personalCollection);
  }

  setupCollectionsEndpoints({ collections });
  setupDatabasesEndpoints(databases);
  fetchMock.get("path:/api/bookmark", []);

  if (openQuestionCard) {
    setupCardsEndpoints([openQuestionCard]);
  }

  let dashboardId: DashboardId | null = null;
  const dashboardsForState: DashboardState["dashboards"] = {};
  const dashboardsForEntities: Dashboard[] = [];
  if (openDashboard) {
    dashboardId = openDashboard.id;
    dashboardsForState[openDashboard.id] = {
      ...openDashboard,
      ordered_cards: openDashboard.ordered_cards.map(c => c.id),
    };
    dashboardsForEntities.push(openDashboard);
  }

  const storeInitialState = createMockState({
    currentUser: user,
    dashboard: createMockDashboardState({
      dashboardId,
      dashboards: dashboardsForState,
    }),
    qb: createMockQueryBuilderState({ card: openQuestionCard }),
    entities: createMockEntitiesState({ dashboards: dashboardsForEntities }),
  });

  renderWithProviders(
    <Route
      path={route}
      component={props => <MainNavbar {...props} isOpen />}
    />,
    {
      storeInitialState,
      initialRoute: pathname,
      withRouter: true,
      withDND: true,
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );
}

async function setupCollectionPage({
  pathname = "/",
  route = "/collection/:slug",
}: Pick<SetupOpts, "pathname" | "route"> = {}) {
  await setup({ pathname, route });

  const rootCollectionElements = {
    link: screen.getByRole("link", { name: /Our analytics/i }),
    listItem: screen.getByRole("treeitem", { name: /Our analytics/i }),
  };

  const personalCollectionElements = {
    link: screen.getByRole("link", { name: /Your personal collection/i }),
    listItem: screen.getByRole("treeitem", {
      name: /Your personal collection/i,
    }),
  };

  const regularCollectionElements = {
    link: screen.getByRole("link", { name: /Test collection/i }),
    listItem: screen.getByRole("treeitem", { name: /Test collection/i }),
  };

  return {
    rootCollectionElements,
    personalCollectionElements,
    regularCollectionElements,
  };
}

describe("nav > containers > MainNavbar", () => {
  describe("homepage link", () => {
    it("should render", async () => {
      await setup();
      const link = screen.getByRole("link", { name: /Home/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/");
    });

    it("should be highlighted if selected", async () => {
      await setup({ pathname: "/" });
      const link = screen.getByRole("listitem", { name: /Home/i });
      expect(link).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("browse data link", () => {
    it("should render", async () => {
      await setup();
      const link = screen.getByRole("link", { name: /Browse data/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/browse");
    });

    it("should not render when a user has no data access", async () => {
      await setup({ hasDataAccess: false });
      expect(
        screen.queryByRole("link", { name: /Browse data/i }),
      ).not.toBeInTheDocument();
    });

    it("should be highlighted if selected", async () => {
      await setup({ pathname: "/browse" });
      const link = screen.getByRole("listitem", { name: /Browse data/i });
      expect(link).toHaveAttribute("aria-selected", "true");
    });

    it("should be highlighted if child route selected", async () => {
      await setup({ pathname: "/browse/1" });
      const link = screen.getByRole("listitem", { name: /Browse data/i });
      expect(link).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("setup database link", () => {
    it("should render when there are no databases connected", async () => {
      await setup({
        hasOwnDatabase: false,
        user: createMockUser({ is_superuser: true }),
      });
      const link = screen.getByRole("link", { name: /Add your own data/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/admin/databases/create");
    });

    it("should not render when there is a database connected", async () => {
      await setup({
        hasOwnDatabase: true,
        user: createMockUser({ is_superuser: true }),
      });
      expect(
        screen.queryByRole("link", { name: /Add your own data/i }),
      ).not.toBeInTheDocument();
    });

    it("should not render to non-admin users", async () => {
      await setup({
        hasOwnDatabase: false,
        user: createMockUser({ is_superuser: false }),
      });
      expect(
        screen.queryByRole("link", { name: /Add your own data/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("collection tree", () => {
    it("should show collections", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({ pathname: "/", route: "/" });

      expect(rootCollectionElements.link).toBeInTheDocument();
      expect(rootCollectionElements.link).toHaveAttribute(
        "href",
        Urls.collection(ROOT_COLLECTION),
      );
      expect(personalCollectionElements.link).toBeInTheDocument();
      expect(personalCollectionElements.link).toHaveAttribute(
        "href",
        Urls.collection(PERSONAL_COLLECTION_BASE),
      );
      expect(regularCollectionElements.link).toBeInTheDocument();
      expect(regularCollectionElements.link).toHaveAttribute(
        "href",
        Urls.collection(TEST_COLLECTION),
      );
    });

    it("should not highlight collections when not selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({ pathname: "/", route: "/" });

      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight regular collection if selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({
        pathname: Urls.collection(TEST_COLLECTION),
      });

      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight root if selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({
        pathname: Urls.collection(ROOT_COLLECTION),
      });

      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight personal collection if selected", async () => {
      const {
        rootCollectionElements,
        personalCollectionElements,
        regularCollectionElements,
      } = await setupCollectionPage({
        pathname: Urls.collection(PERSONAL_COLLECTION_BASE),
      });

      expect(personalCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(rootCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(regularCollectionElements.listItem).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight question's collection if selected", async () => {
      const card = createMockCard({
        collection_id: TEST_COLLECTION.id as number,
      });
      await setup({
        openQuestionCard: card,
        route: "/question/:slug",
        pathname: `/question/${card.id}`,
      });

      expect(
        screen.getByRole("treeitem", { name: /Test collection/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight dashboard's collection if selected", async () => {
      const dashboard = createMockDashboard({
        collection_id: TEST_COLLECTION.id as number,
      });
      await setup({
        openDashboard: dashboard,
        route: "/dashboard/:slug",
        pathname: `/dashboard/${dashboard.id}`,
      });

      expect(
        screen.getByRole("treeitem", { name: /Test collection/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });

    it("should highlight model's collection when on model detail page", async () => {
      const model = createMockCard({
        collection_id: TEST_COLLECTION.id as number,
        dataset: true,
      });
      await setup({
        route: "/model/:slug/detail",
        pathname: `/model/${model.id}/detail`,
        openQuestionCard: model,
      });

      expect(
        screen.getByRole("treeitem", { name: /Test collection/i }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("treeitem", { name: /Our analytics/i }),
      ).toHaveAttribute("aria-selected", "false");
    });
  });
});
