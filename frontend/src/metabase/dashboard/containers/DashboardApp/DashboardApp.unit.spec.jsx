import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import {
  within,
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
  setupCollectionsEndpoints([]);
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

const navigateToDashboardActionsEditor = async () => {
  userEvent.click(screen.getByLabelText("Edit dashboard"));
  userEvent.click(await screen.findByLabelText(/Add action/i));

  const actionSidebarBody = await screen.findByTestId("action-sidebar-body");

  userEvent.click(within(actionSidebarBody).getByText("Pick an action"));

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );

  userEvent.click(
    screen.getByRole("heading", { name: TEST_COLLECTION_ITEM.name }),
  );
  userEvent.click(screen.getByText("Create new action"));

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );
};

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

  describe("ActionCreatorModal onClickOutside behavior", () => {
    it("should not close ActionCreator modal when clicking outside modal", async () => {
      await setup({});
      await navigateToDashboardActionsEditor();

      userEvent.click(document.body);
      const mockNativeQueryEditor = await screen.findByTestId(
        "mock-native-query-editor",
      );

      expect(mockNativeQueryEditor).toBeInTheDocument();
    });
    it("should close ActionCreator modal when clicking modal's 'Cancel' button", async () => {
      await setup({});
      await navigateToDashboardActionsEditor();

      userEvent.click(
        within(screen.getByTestId("action-creator-modal-actions")).getByText(
          "Cancel",
        ),
      );

      expect(
        screen.queryByTestId("mock-native-query-editor"),
      ).not.toBeInTheDocument();
    });
  });
});
