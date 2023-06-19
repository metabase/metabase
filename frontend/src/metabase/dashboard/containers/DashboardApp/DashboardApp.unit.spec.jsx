import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import {
  screen,
  renderWithProviders,
  waitForElementToBeRemoved,
} from "__support__/ui";
import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";
import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { callMockEvent } from "__support__/events";

const TEST_DASHBOARD = createMockDashboard();
const TEST_COLLECTION = createMockCollection();

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  settings: { "database-enable-actions": true },
});

const TEST_COLLECTION_ITEM = createMockCollectionItem({
  collection: TEST_COLLECTION,
  model: "dataset",
});

const TEST_CARD = createMockCard();

const TEST_TABLE = createMockTable();

async function setup({ user = createMockUser() }) {
  setupDatabasesEndpoints([TEST_DATABASE_WITH_ACTIONS]);
  setupDashboardEndpoints(createMockDashboard(TEST_DASHBOARD));
  setupCollectionsEndpoints({ collections: [] });
  setupCollectionItemsEndpoint(TEST_COLLECTION);
  setupSearchEndpoints([TEST_COLLECTION_ITEM]);
  setupCardsEndpoints([TEST_CARD]);
  setupTableEndpoints([TEST_TABLE]);

  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  window.HTMLElement.prototype.scrollIntoView = function () {};
  const mockEventListener = jest.spyOn(window, "addEventListener");

  const DashboardAppContainer = props => {
    return (
      <main>
        <link rel="icon" />
        <DashboardApp {...props} />
      </main>
    );
  };

  renderWithProviders(
    <Route path="/dashboard/:slug" component={DashboardAppContainer} />,
    {
      initialRoute: `/dashboard/${TEST_DASHBOARD.id}`,
      currentUser: user,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE_WITH_ACTIONS],
        }),
      },
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );

  return { mockEventListener };
}

describe("DashboardApp", function () {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("beforeunload events", () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it("should have a beforeunload event when the user tries to leave a dirty dashboard", async function () {
      const { mockEventListener } = await setup({});

      userEvent.click(screen.getByLabelText("Edit dashboard"));
      userEvent.click(screen.getByTestId("dashboard-name-heading"));
      userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
      // need to click away from the input to trigger the isDirty flag
      userEvent.tab();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not have a beforeunload event when the dashboard is unedited", async function () {
      const { mockEventListener } = await setup({});

      userEvent.click(screen.getByLabelText("Edit dashboard"));

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });
  });
});
