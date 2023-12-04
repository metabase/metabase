import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  screen,
  renderWithProviders,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { DashboardAppConnected } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDatabase,
  createMockTable,
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

const TestHome = () => <div />;

interface Options {
  dashboard?: Partial<Dashboard>;
}

async function setup({ dashboard }: Options = {}) {
  const mockDashboard = createMockDashboard(dashboard);
  const dashboardId = mockDashboard.id;

  const channelData = { channels: {} };
  fetchMock.get("path:/api/pulse/form_input", channelData);

  setupDatabasesEndpoints([TEST_DATABASE_WITH_ACTIONS]);
  setupDashboardEndpoints(mockDashboard);
  setupCollectionsEndpoints({ collections: [] });
  setupCollectionItemsEndpoint({
    collection: TEST_COLLECTION,
    collectionItems: [],
  });
  setupSearchEndpoints([TEST_COLLECTION_ITEM]);
  setupCardsEndpoints([TEST_CARD]);
  setupTableEndpoints(TEST_TABLE);

  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  window.HTMLElement.prototype.scrollIntoView = () => null;
  const mockEventListener = jest.spyOn(window, "addEventListener");

  const DashboardAppContainer = (props: any) => {
    return (
      <main>
        <link rel="icon" />
        <DashboardAppConnected {...props} />
      </main>
    );
  };

  const { history } = renderWithProviders(
    <>
      <Route path="/" component={TestHome} />
      <Route path="/dashboard/:slug" component={DashboardAppContainer} />
    </>,
    {
      initialRoute: `/dashboard/${dashboardId}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE_WITH_ACTIONS],
        }),
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    dashboardId,
    history: checkNotNull(history),
    mockEventListener,
  };
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
      const { mockEventListener } = await setup();

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
      const { mockEventListener } = await setup();

      userEvent.click(screen.getByLabelText("Edit dashboard"));

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });

    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const { dashboardId, history } = await setup();

      history.push("/");
      history.push(`/dashboard/${dashboardId}`);

      await waitForLoaderToBeRemoved();

      userEvent.click(screen.getByLabelText("Edit dashboard"));

      history.goBack();

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const { dashboardId, history } = await setup();

      history.push("/");
      history.push(`/dashboard/${dashboardId}`);

      await waitForLoaderToBeRemoved();

      userEvent.click(screen.getByLabelText("Edit dashboard"));
      userEvent.click(screen.getByTestId("dashboard-name-heading"));
      userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
      userEvent.tab(); // need to click away from the input to trigger the isDirty flag

      history.goBack();

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving with no changes via Cancel button", async () => {
      await setup();

      userEvent.click(screen.getByLabelText("Edit dashboard"));

      userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via Cancel button", async () => {
      await setup();

      userEvent.click(screen.getByLabelText("Edit dashboard"));
      userEvent.click(screen.getByTestId("dashboard-name-heading"));
      userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
      userEvent.tab(); // need to click away from the input to trigger the isDirty flag

      userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });
  });

  describe("empty dashboard", () => {
    it("should prompt the user to add a question if they have write access", async () => {
      await setup();

      expect(screen.getByText(/add a saved question/i)).toBeInTheDocument();
    });

    it("should should show an empty state without the 'add a question' prompt if the user lacks write access", async () => {
      await setup({ dashboard: { can_write: false } });

      expect(
        screen.getByText(/there's nothing here, yet./i),
      ).toBeInTheDocument();
    });
  });
});
