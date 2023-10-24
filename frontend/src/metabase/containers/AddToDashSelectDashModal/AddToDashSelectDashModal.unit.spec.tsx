import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import {
  setupMostRecentlyViewedDashboard,
  setupCollectionsEndpoints,
  setupSearchEndpoints,
  setupCollectionByIdEndpoint,
  setupDashboardCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
import type { Card, Collection, Dashboard } from "metabase-types/api";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import { ConnectedAddToDashSelectDashModal } from "./AddToDashSelectDashModal";

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

const COLLECTION = createMockCollection({
  id: 1,
  name: "Collection",
  can_write: true,
  is_personal: false,
  location: "/",
});

// Do not remove. This is being used by `DASHBOARD`
// because its `collection_id` is `2` (this collection's ID)
const SUBCOLLECTION = createMockCollection({
  id: 2,
  name: "Nested collection",
  can_write: true,
  is_personal: false,
  location: `/${COLLECTION.id}/`,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER.id,
  can_write: true,
  is_personal: true,
  location: "/",
});

const PERSONAL_SUBCOLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id + 1,
  name: "Nested personal collection",
  can_write: true,
  is_personal: true,
  location: `/${PERSONAL_COLLECTION.id}/`,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const COLLECTIONS = [
  ROOT_COLLECTION,
  COLLECTION,
  SUBCOLLECTION,
  PERSONAL_COLLECTION,
  PERSONAL_SUBCOLLECTION,
];

interface SetupOpts {
  card?: Card;
  collections?: Collection[];
  error?: string;
  dashboard?: Dashboard;
  mostRecentlyViewedDashboard?: Dashboard;
  waitForContent?: boolean;
}

const setup = async ({
  card = CARD,
  collections = COLLECTIONS,
  dashboard = DASHBOARD,
  mostRecentlyViewedDashboard = undefined,
  error,
  waitForContent = true,
}: SetupOpts = {}) => {
  setupSearchEndpoints([]);
  setupCollectionsEndpoints({ collections, rootCollection: ROOT_COLLECTION });
  setupDashboardCollectionItemsEndpoint([dashboard]);
  setupCollectionByIdEndpoint({ collections, error });
  setupMostRecentlyViewedDashboard(mostRecentlyViewedDashboard);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <ConnectedAddToDashSelectDashModal
          card={card}
          onChangeLocation={() => undefined}
          onClose={() => undefined}
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
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  }
};

describe("AddToDashSelectDashModal", () => {
  describe("Create new Dashboard", () => {
    it("should open CreateDashboardModal", async () => {
      await setup({
        mostRecentlyViewedDashboard: DASHBOARD,
      });

      const createNewDashboard = screen.getByRole("heading", {
        name: "Create a new dashboard",
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
      await setup({
        waitForContent: false,
        mostRecentlyViewedDashboard: DASHBOARD,
      });

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should show error", async () => {
      const ERROR = "Server Error!";
      await setup({ error: ERROR, mostRecentlyViewedDashboard: DASHBOARD });

      expect(screen.getByText(ERROR)).toBeInTheDocument();
    });

    // XXX: 7,8,9,10
    describe("when user visited some dashboard in last 24hrs", () => {
      it("should preselected last visited dashboard in the picker", async () => {
        await setup({
          mostRecentlyViewedDashboard: DASHBOARD,
        });

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
            mostRecentlyViewedDashboard: DASHBOARD_AT_ROOT,
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
        await setup();

        // breadcrumbs show root collection only
        expect(screen.getByTestId("item-picker-header")).toHaveTextContent(
          ROOT_COLLECTION.name,
        );
      });

      describe("question is in a public collection", () => {
        describe('"Create a new dashboard" option', () => {
          // XXX: #3
          it('should render "Create a new dashboard" option when opening the root collection (public collection)', async () => {
            await setup();

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });

          // XXX: #3
          it('should render "Create a new dashboard" option when opening public subcollections', async () => {
            await setup();

            userEvent.click(
              screen.getByRole("heading", {
                name: COLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();

            userEvent.click(
              screen.getByRole("heading", {
                name: SUBCOLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });

          // XXX: #4
          it('should render "Create a new dashboard" option when opening personal subcollections', async () => {
            await setup();

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });
        });

        describe("whether we should render dashboards in a collection", () => {
          // XXX: #1
          it("should render dashboards when opening the root collection (public collection)", async () => {
            // no `collection` and `collection_id` means it's in the root collection
            const dashboardInRootCollection = createMockDashboard({
              id: 3,
              name: "Dashboard in root collection",
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInRootCollection,
            });

            expect(
              await screen.findByRole("heading", {
                name: dashboardInRootCollection.name,
              }),
            ).toBeInTheDocument();
          });

          // XXX: #1
          it("should render dashboards when opening public subcollections", async () => {
            const dashboardInPublicSubcollection = createMockDashboard({
              id: 3,
              name: "Dashboard in public subcollection",
              collection_id: COLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInPublicSubcollection,
            });

            userEvent.click(
              screen.getByRole("heading", {
                name: COLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPublicSubcollection.name,
              }),
            ).toBeInTheDocument();
          });

          // XXX: #1
          it("should render dashboards when opening personal collections", async () => {
            const dashboardInPersonalCollection = createMockDashboard({
              id: 3,
              name: "Dashboard in personal collection",
              collection_id: PERSONAL_COLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInPersonalCollection,
            });

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalCollection.name,
              }),
            ).toBeInTheDocument();
          });

          // XXX: #1
          it("should render dashboards when opening personal subcollections", async () => {
            const dashboardInPersonalSubcollection = createMockDashboard({
              id: 3,
              name: "Dashboard in personal subcollection",
              collection_id: PERSONAL_SUBCOLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              dashboard: dashboardInPersonalSubcollection,
            });

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );
            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalSubcollection.name,
              }),
            ).toBeInTheDocument();
          });
        });
      });

      describe("question is in a personal collection", () => {
        const CARD_IN_PERSONAL_COLLECTION = createMockCard({
          id: 2,
          name: "Card in a personal collection",
          dataset: true,
          collection: PERSONAL_COLLECTION,
        });

        describe('"Create a new dashboard" option', () => {
          // XXX: #5
          it('should not render "Create a new dashboard" option when opening the root collection (public collection)', async () => {
            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
            });

            expect(
              screen.queryByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).not.toBeInTheDocument();
          });

          // XXX: #6
          it('should render "Create a new dashboard" option when opening personal subcollections', async () => {
            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
            });

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              screen.getByRole("heading", {
                name: "Create a new dashboard",
              }),
            ).toBeInTheDocument();
          });
        });

        describe("whether we should render dashboards in a collection", () => {
          // XXX: #2
          it("should not render dashboards when opening the root collection (public collection)", async () => {
            const dashboardInPublicCollection = createMockDashboard({
              id: 3,
              name: "Dashboard in public collection",
              // `null` means it's in the root collection
              collection_id: null,
              model: "dashboard",
            });

            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
              dashboard: dashboardInPublicCollection,
            });

            await waitFor(() => {
              expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
            });

            expect(
              screen.queryByRole("heading", {
                name: dashboardInPublicCollection.name,
              }),
            ).not.toBeInTheDocument();
          });

          // XXX: #2
          it("should render dashboards when opening personal collections", async () => {
            const dashboardInPersonalCollection = createMockDashboard({
              id: 3,
              name: "Dashboard in personal collection",
              collection_id: PERSONAL_COLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
              dashboard: dashboardInPersonalCollection,
            });

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalCollection.name,
              }),
            ).toBeInTheDocument();
          });

          // XXX: #2
          it("should render dashboards when opening personal subcollections", async () => {
            const dashboardInPersonalSubcollection = createMockDashboard({
              id: 3,
              name: "Dashboard in personal subcollection",
              collection_id: PERSONAL_SUBCOLLECTION.id as number,
              model: "dashboard",
            });

            await setup({
              card: CARD_IN_PERSONAL_COLLECTION,
              dashboard: dashboardInPersonalSubcollection,
            });

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_COLLECTION.name,
              }),
            );

            userEvent.click(
              screen.getByRole("heading", {
                name: PERSONAL_SUBCOLLECTION.name,
              }),
            );

            expect(
              await screen.findByRole("heading", {
                name: dashboardInPersonalSubcollection.name,
              }),
            ).toBeInTheDocument();
          });
        });
      });
    });
  });
});
