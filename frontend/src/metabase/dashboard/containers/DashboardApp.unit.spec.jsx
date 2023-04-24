import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import {
  screen,
  renderWithProviders,
  waitForElementToBeRemoved,
} from "__support__/ui";
import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import {
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
} from "__support__/server-mocks";

const TEST_DASHBOARD = createMockDashboard({
  id: 1,
  name: "Example",
});

const TEST_COLLECTION = createMockCollection({
  id: "root",
});

// calls event handler in the mockEventListener that matches the eventName
// and uses the mockEvent to hold the callback's return value
const callMockEvent = (mockEventListener, eventName) => {
  const mockEvent = {
    preventDefault: jest.fn(),
  };

  mockEventListener.mock.calls
    .filter(([event]) => eventName === event)
    .forEach(([_, callback]) => callback(mockEvent));
  return mockEvent;
};

async function setup({ user = createMockUser() }) {
  setupDashboardEndpoints(createMockDashboard(TEST_DASHBOARD));
  setupCollectionsEndpoints([]);
  setupCollectionItemsEndpoint(TEST_COLLECTION);

  fetchMock.get("path:/api/bookmark", []);

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
