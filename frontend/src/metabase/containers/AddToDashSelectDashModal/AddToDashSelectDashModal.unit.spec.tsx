import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import {
  setupMostRecentlyViewedDashboard,
  setupCollectionsEndpoints,
  setupSearchEndpoints,
  setupCollectionByIdEndpoint,
  setupDashboardCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
import type { Card, Collection, Dashboard } from "metabase-types/api";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import { AddToDashSelectDashModal } from "./AddToDashSelectDashModal";

const CARD = createMockCard({ id: 1, name: "Model Uno", dataset: true });

const CURRENT_USER = createMockUser({
  id: 1,
  personal_collection_id: 100,
  is_superuser: true,
});

const DASHBOARD = createMockDashboard({
  id: 3,
  name: "Test dashboard",
  collection_id: 2,
  model: "dashboard",
});

const DASHBOARD_AT_ROOT = createMockDashboard({
  id: 4,
  name: "Dashboard at root",
  collection_id: null,
  model: "dashboard",
});

const DASHBOARDS_BY_ID = {
  [DASHBOARD.id]: DASHBOARD,
  [DASHBOARD_AT_ROOT.id]: DASHBOARD_AT_ROOT,
};

const COLLECTION = createMockCollection({
  id: 1,
  name: "Collection",
  can_write: true,
  location: "/",
});

const NESTED_COLLECTION = createMockCollection({
  id: 2,
  name: "Nested collection",
  can_write: true,
  location: `/${COLLECTION.id}/`,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER.id,
  can_write: true,
  location: "/",
});

const NESTED_PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id + 1,
  name: "Nested personal collection",
  can_write: true,
  location: `/${PERSONAL_COLLECTION.id}/`,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const COLLECTIONS = [
  ROOT_COLLECTION,
  COLLECTION,
  NESTED_COLLECTION,
  PERSONAL_COLLECTION,
  NESTED_PERSONAL_COLLECTION,
];

interface SetupOpts {
  card?: Card;
  collections?: Collection[];
  error?: string;
  dashboard?: Dashboard;
  noRecentDashboard?: boolean;
  waitForContent?: boolean;
}

const setup = async ({
  card = CARD,
  collections = COLLECTIONS,
  dashboard = DASHBOARD,
  noRecentDashboard = false,
  error,
  waitForContent = true,
}: SetupOpts = {}) => {
  setupSearchEndpoints([]);
  setupCollectionsEndpoints({ collections, rootCollection: ROOT_COLLECTION });
  setupDashboardCollectionItemsEndpoint([dashboard]);
  setupCollectionByIdEndpoint({ collections, error });
  setupMostRecentlyViewedDashboard(noRecentDashboard ? undefined : dashboard);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <AddToDashSelectDashModal
          card={card}
          onChangeLocation={() => undefined}
          onClose={() => undefined}
          dashboards={DASHBOARDS_BY_ID}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );

  if (waitForContent) {
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
  }
};

describe("AddToDashSelectDashModal", () => {
  describe("Create new Dashboard", () => {
    it("should open CreateDashboardModal", async () => {
      await setup();

      const createNewDashboard = screen.getByRole("heading", {
        name: /create a new dashboard/i,
      });

      userEvent.click(createNewDashboard);

      // opened CreateDashboardModal
      expect(
        screen.getByRole("heading", {
          name: /new dashboard/i,
        }),
      ).toBeInTheDocument();
    });
  });

  describe("Add to existing Dashboard", () => {
    it("should show loading", async () => {
      await setup({ waitForContent: false });

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should show error", async () => {
      const ERROR = "Server Error!";
      await setup({ error: ERROR });

      expect(screen.getByText(ERROR)).toBeInTheDocument();
    });

    describe("when user visited some dashboard in last 24hrs", () => {
      it("should preselected last visited dashboard in the picker", async () => {
        await setup();

        const dashboardCollection = COLLECTIONS.find(
          collection => collection.id === DASHBOARD.collection_id,
        );

        // breadcrumbs
        expect(
          screen.getByText(`${dashboardCollection?.name}`),
        ).toBeInTheDocument();
        // dashboard item
        expect(screen.getByText(DASHBOARD.name)).toBeInTheDocument();
      });

      describe("when last visited dashboard belongs to root", () => {
        it("should render root collection", async () => {
          await setup({
            dashboard: DASHBOARD_AT_ROOT,
          });

          // breadcrumbs
          expect(screen.getByText(ROOT_COLLECTION.name)).toBeInTheDocument();
          // dashboard item
          expect(screen.getByText(DASHBOARD_AT_ROOT.name)).toBeInTheDocument();
        });
      });
    });

    describe("when user didn't visit any dashboard during last 24hrs", () => {
      it("should render root collection without preselection", async () => {
        await setup({
          noRecentDashboard: true,
        });

        // breadcrumbs show root collection only
        expect(screen.getByTestId("item-picker-header")).toHaveTextContent(
          ROOT_COLLECTION.name,
        );
      });

      describe("question is in personal collection", () => {
        const CARD_IN_PERSONAL_COLLECTION = createMockCard({
          id: 2,
          name: "Card in a personal collection",
          dataset: true,
          collection_id: PERSONAL_COLLECTION.id as number,
        });

        it('should not render "Create a new dashboard" option when opening public collections', async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            noRecentDashboard: true,
          });

          expect(
            screen.queryByRole("heading", {
              name: /create a new dashboard/i,
            }),
          ).not.toBeInTheDocument();
        });

        it('should render "Create a new dashboard" option when opening personal collections', async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            noRecentDashboard: true,
          });
          // await setup();

          userEvent.click(
            screen.getByRole("heading", {
              name: PERSONAL_COLLECTION.name,
            }),
          );

          expect(
            screen.getByRole("heading", {
              name: /create a new dashboard/i,
            }),
          ).toBeInTheDocument();
        });

        it('should render "Create a new dashboard" option when opening personal subcollections', async () => {
          await setup({
            card: CARD_IN_PERSONAL_COLLECTION,
            noRecentDashboard: true,
          });

          userEvent.click(
            screen.getByRole("heading", {
              name: PERSONAL_COLLECTION.name,
            }),
          );
          userEvent.click(
            screen.getByRole("heading", {
              name: NESTED_PERSONAL_COLLECTION.name,
            }),
          );

          expect(
            screen.getByRole("heading", {
              name: /create a new dashboard/i,
            }),
          ).toBeInTheDocument();
        });
      });
    });
  });
});
