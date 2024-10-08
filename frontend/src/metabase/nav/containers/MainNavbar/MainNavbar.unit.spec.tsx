import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { ModelResult } from "metabase/browse/models";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";
import type { Card, Dashboard, DashboardId, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";
import type { DashboardState } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockQueryBuilderState,
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import MainNavbar from "./MainNavbar";

type SetupOpts = {
  pathname?: string;
  route?: string;
  user?: User | null;
  hasDataAccess?: boolean;
  withAdditionalDatabase?: boolean;
  isUploadEnabled?: boolean;
  openQuestionCard?: Card;
  openDashboard?: Dashboard;
  models?: ModelResult[];
  canCurateRootCollection?: boolean;
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

async function setup({
  pathname = "/",
  route = pathname,
  user = createMockUser(),
  hasDataAccess = true,
  openDashboard,
  openQuestionCard,
  models = [],
  isUploadEnabled = false,
  withAdditionalDatabase = true,
  canCurateRootCollection = false,
}: SetupOpts = {}) {
  const SAMPLE_DATABASE = createMockDatabase({
    id: 1,
    name: "Sample Database",
    is_sample: true,
    can_upload: user?.is_superuser || (isUploadEnabled && hasDataAccess),
  });

  const USER_DATABASE = createMockDatabase({
    id: 2,
    name: "User Database",
    is_sample: false,
  });

  const databases = [];

  if (hasDataAccess) {
    databases.push(SAMPLE_DATABASE);

    if (withAdditionalDatabase) {
      databases.push(USER_DATABASE);
    }
  }
  const OUR_ANALYTICS = createMockCollection({
    ...ROOT_COLLECTION,
    can_write: user?.is_superuser || canCurateRootCollection,
  });

  const collections = [TEST_COLLECTION];

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

  setupCollectionsEndpoints({
    collections,
    rootCollection: OUR_ANALYTICS,
  });
  setupCollectionByIdEndpoint({
    collections: [PERSONAL_COLLECTION_BASE, TEST_COLLECTION],
  });
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints(models);
  setupCollectionItemsEndpoint({
    collection: createMockCollection(OUR_ANALYTICS),
    collectionItems: [],
  });
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
      dashcards: openDashboard.dashcards.map(c => c.id),
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
    settings: createMockSettingsState({
      "uploads-settings": {
        db_id: isUploadEnabled ? SAMPLE_DATABASE.id : null,
        schema_name: null,
        table_prefix: null,
      },
    }),
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

  await waitForLoaderToBeRemoved();
  await waitForLoaderToBeRemoved(); // tests will fail without the 2nd call
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

  describe("browse databases link", () => {
    it("should render", async () => {
      await setup();
      const listItem = screen.getByRole("listitem", {
        name: /Browse databases/i,
      });
      const link = within(listItem).getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/browse/databases");
    });

    it("should not render when a user has no data access", async () => {
      await setup({ hasDataAccess: false });
      expect(
        screen.queryByRole("listitem", { name: /Browse databases/i }),
      ).not.toBeInTheDocument();
    });

    it("should be highlighted if selected", async () => {
      await setup({ pathname: "/browse/databases" });
      const listItem = screen.getByRole("listitem", {
        name: /Browse databases/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
    });

    it("should be highlighted if child route selected", async () => {
      await setup({ pathname: "/browse/databases/1" });
      const listItem = screen.getByRole("listitem", {
        name: /Browse databases/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("browse models link", () => {
    it("should render when there are models", async () => {
      await setup({ models: [createMockModelResult()] });
      const listItem = await screen.findByRole("listitem", {
        name: /Browse models/i,
      });
      const link = await within(listItem).findByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/browse/models");
    });

    it("should render when there are no models", async () => {
      await setup({ models: [] });
      expect(
        screen.getByRole("listitem", { name: /Browse models/i }),
      ).toBeInTheDocument();
    });

    it("should be highlighted if selected", async () => {
      await setup({
        models: [createMockModelResult()],
        pathname: "/browse/models",
      });
      const listItem = await screen.findByRole("listitem", {
        name: /Browse models/i,
      });
      expect(listItem).toHaveAttribute("aria-selected", "true");
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
        type: "model",
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

  describe("better onboarding section", () => {
    it.each([
      { role: "admins", is_superuser: true },
      { role: "regular users", is_superuser: false },
    ])(
      "should render Metabase learn link to $role",
      async ({ is_superuser }) => {
        await setup({ user: createMockUser({ is_superuser }) });
        const link = screen.getByRole("link", { name: /How to use Metabase/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "https://www.metabase.com/learn/");
      },
    );

    describe("add data section", () => {
      it("should render for admins", async () => {
        await setup({
          withAdditionalDatabase: false,
          user: createMockUser({ is_superuser: true }),
        });

        const dataSection = screen.getByTestId("sidebar-add-data-section");
        expect(dataSection).toBeInTheDocument();

        const introCTA = screen.getByText(
          "Start by adding your data. Connect to a database or upload a CSV file.",
        );
        expect(introCTA).toBeInTheDocument();

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        expect(addDataButton).toBeInTheDocument();
        await userEvent.click(addDataButton);

        const menu = screen.getByRole("menu");
        const menuItems = screen.getAllByRole("menuitem");

        expect(menuItems).toHaveLength(2);
        expect(within(menu).getAllByRole("link")).toHaveLength(1);
      });

      it("intro CTA should not render when there are databases connected", async () => {
        await setup({
          withAdditionalDatabase: true,
          user: createMockUser({ is_superuser: true }),
        });

        const introCTA = screen.queryByText(
          "Start by adding your data. Connect to a database or upload a CSV file.",
        );
        expect(introCTA).not.toBeInTheDocument();
      });

      it("should render for regular users with 'curate' root collection permissions if uploads are disabled, but they have general data access", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: true,
          isUploadEnabled: false,
        });

        const dataSection = screen.getByTestId("sidebar-add-data-section");
        expect(dataSection).toBeInTheDocument();
      });

      it("should render for regular users with 'curate' root collection permissions if uploads are enabled for a database and they can upload to that database", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: true,
          isUploadEnabled: true,
        });

        const dataSection = screen.getByTestId("sidebar-add-data-section");
        expect(dataSection).toBeInTheDocument();
      });

      it("should not render for regular users if they cannot 'curate' the root collection", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: false,
          hasDataAccess: true,
          isUploadEnabled: true,
        });

        const dataSection = screen.queryByTestId("sidebar-add-data-section");
        expect(dataSection).not.toBeInTheDocument();
      });

      it("should not render for regular users if they don't have data access", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: false,
          isUploadEnabled: true,
        });

        const dataSection = screen.queryByTestId("sidebar-add-data-section");
        expect(dataSection).not.toBeInTheDocument();
      });
    });

    describe("'Add a database' menu item", () => {
      it("should be wrapped in a link", async () => {
        await setup({
          user: createMockUser({ is_superuser: true }),
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const menu = screen.getByRole("menu");
        const [addDatabaseMenuItem] = screen.getAllByRole("menuitem");
        const linkWrapper = within(menu).getByRole("link");

        expect(linkWrapper).toHaveAttribute("href", "/admin/databases/create");
        expect(within(linkWrapper).getByRole("menuitem")).toStrictEqual(
          addDatabaseMenuItem,
        );
      });

      it("should render properly for admins", async () => {
        await setup({
          user: createMockUser({ is_superuser: true }),
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const [addDatabaseMenuItem] = screen.getAllByRole("menuitem");

        expect(
          within(addDatabaseMenuItem).getByText("Add a database"),
        ).toBeInTheDocument();
        expect(
          within(addDatabaseMenuItem).getByText(
            "PostgreSQL, MySQL, Snowflake, ...",
          ),
        ).toBeInTheDocument();
        expect(
          within(addDatabaseMenuItem).getByLabelText("database icon"),
        ).toBeInTheDocument();
      });

      it("should not render for regular users", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: true,
          isUploadEnabled: true,
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const menuItems = screen.queryAllByRole("menuitem");
        const [menuItem] = menuItems;
        expect(menuItems).toHaveLength(1);
        expect(
          within(menuItem).queryByText("Add a database"),
        ).not.toBeInTheDocument();
      });
    });

    describe("'Upload a spreadsheet' menu item", () => {
      it("should render properly for admins", async () => {
        await setup({
          user: createMockUser({ is_superuser: true }),
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);
        const [_, uploadCSVMenuItem] = screen.getAllByRole("menuitem");

        expect(
          within(uploadCSVMenuItem).getByText("Upload a spreadsheet"),
        ).toBeInTheDocument();
        expect(
          within(uploadCSVMenuItem).getByText(".csv, .tsv (50 MB max)"),
        ).toBeInTheDocument();
        expect(
          within(uploadCSVMenuItem).getByLabelText("table2 icon"),
        ).toBeInTheDocument();
      });

      it("should render properly for regular users", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: true,
          isUploadEnabled: true,
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);
        const [uploadCSVMenuItem] = screen.getAllByRole("menuitem");

        expect(
          within(uploadCSVMenuItem).getByText("Upload a spreadsheet"),
        ).toBeInTheDocument();
        expect(
          within(uploadCSVMenuItem).getByText(".csv, .tsv (50 MB max)"),
        ).toBeInTheDocument();
        expect(
          within(uploadCSVMenuItem).getByLabelText("table2 icon"),
        ).toBeInTheDocument();
      });

      it("clicking on it should show a CSV info modal for an admin, if uploads are disabled", async () => {
        await setup({
          user: createMockUser({ is_superuser: true }),
          isUploadEnabled: false,
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const menu = screen.getByRole("menu");
        const [_, uploadCSVMenuItem] = screen.getAllByRole("menuitem");

        await userEvent.click(uploadCSVMenuItem);
        expect(menu).not.toBeInTheDocument();

        const modal = screen.getByRole("dialog");
        expect(modal).toBeInTheDocument();
        [
          "Upload CSVs to Metabase",
          "Team members will be able to upload CSV files and work with them just like any other data source.",
          "You'll be able to pick the default database where the data should be stored when enabling the feature.",
          "Go to setup",
        ].forEach(copy => {
          expect(within(modal).getByText(copy)).toBeInTheDocument();
        });

        expect(within(modal).getByRole("link")).toHaveAttribute(
          "href",
          "/admin/settings/uploads",
        );
      });

      it("clicking on it should show a CSV info modal for a regular user, if uploads are disabled", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: true,
          isUploadEnabled: false,
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const menu = screen.getByRole("menu");
        const [uploadCSVMenuItem] = screen.getAllByRole("menuitem");

        await userEvent.click(uploadCSVMenuItem);
        expect(menu).not.toBeInTheDocument();

        const modal = screen.getByRole("dialog");
        expect(modal).toBeInTheDocument();
        [
          "Upload CSVs to Metabase",
          "You'll need to ask your admin to enable this feature to get started. Then, you'll be able to upload CSV files and work with them just like any other data source.",
          "Got it",
        ].forEach(copy => {
          expect(within(modal).getByText(copy)).toBeInTheDocument();
        });

        expect(within(modal).queryByRole("link")).not.toBeInTheDocument();
      });

      it("clicking on it should not show a CSV info modal for an admin, if uploads are enabled", async () => {
        await setup({
          user: createMockUser({ is_superuser: true }),
          isUploadEnabled: true,
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const menu = screen.getByRole("menu");
        const [_, uploadCSVMenuItem] = screen.getAllByRole("menuitem");

        await userEvent.click(uploadCSVMenuItem);
        expect(menu).not.toBeInTheDocument();

        const modal = screen.queryByRole("dialog");
        expect(modal).not.toBeInTheDocument();
      });

      it("clicking on it should not show a CSV info modal for a regular user, if uploads are enabled", async () => {
        await setup({
          user: createMockUser({ is_superuser: false }),
          canCurateRootCollection: true,
          hasDataAccess: true,
          isUploadEnabled: true,
        });

        const addDataButton = screen.getByRole("button", { name: /Add data/i });
        await userEvent.click(addDataButton);

        const menu = screen.getByRole("menu");
        const [uploadCSVMenuItem] = screen.getAllByRole("menuitem");

        await userEvent.click(uploadCSVMenuItem);
        expect(menu).not.toBeInTheDocument();

        const modal = screen.queryByRole("dialog");
        expect(modal).not.toBeInTheDocument();
      });
    });
  });
});
