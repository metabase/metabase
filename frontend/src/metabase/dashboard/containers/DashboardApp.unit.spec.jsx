import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import {
  within,
  screen,
  renderWithProviders,
  waitForElementToBeRemoved,
  fireEvent,
} from "__support__/ui";
import DashboardApp from "metabase/dashboard/containers/DashboardApp";
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
  setupCardsEndpoints,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";

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

  fetchMock.get("path:/api/bookmark", []);
  fetchMock.get("path:/api/action", []);

  window.HTMLElement.prototype.scrollIntoView = function () {};

  const DashboardAppContainer = props => {
    return (
      <main>
        <link rel="icon" />
        <DashboardApp {...props} />
      </main>
    );
  };

  const { container } = renderWithProviders(
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

  return { container };
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

  describe("ActionCreatorModal onClickOutside behavior", () => {
    it("should not close ActionCreator modal when clicking outside modal", async () => {
      const { container } = await setup({});
      await navigateToDashboardActionsEditor();

      fireEvent.click(container.ownerDocument.body);
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
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
