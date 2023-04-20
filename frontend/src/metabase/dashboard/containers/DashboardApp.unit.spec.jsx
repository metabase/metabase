import React from "react";
import { Route } from "react-router";
import { screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { renderWithProviders, waitForElementToBeRemoved } from "__support__/ui";
import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import {
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";

const TEST_DASHBOARD = createMockDashboard({
  id: 1,
  name: "Example",
});

const TEST_COLLECTION = createMockCollection({
  id: "root",
});

async function setup(user = createMockUser()) {
  setupDashboardEndpoints(createMockDashboard(TEST_DASHBOARD));
  setupCollectionsEndpoints([]);
  setupCollectionItemsEndpoint(TEST_COLLECTION);

  fetchMock.get("path:/api/bookmark", []);

  const { mockEvent, events } = createMockEventListener();

  const DashboardAppContainer = props => {
    return (
      <main>
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

  return { mockEvent, events };
}

function createMockEventListener() {
  const events = {};
  const mockEvent = {
    preventDefault: jest.fn(),
    returnValue: undefined,
  };

  jest
    .spyOn(window, "addEventListener")
    .mockImplementation((event, callback) => {
      events[event] = () => callback(mockEvent);
    });

  jest.spyOn(window, "removeEventListener").mockImplementation((event, _) => {
    delete events[event];
  });

  return { mockEvent, events };
}

describe("DashboardApp", function () {
  beforeAll(() => {
    const linkElem = document.createElement("link");
    linkElem.rel = "icon";
    document.head.append(linkElem);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should have a beforeunload event when the user tries to leave a dirty dashboard", async function () {
    const { events, mockEvent } = await setup();

    userEvent.click(screen.getByLabelText("Edit dashboard"));
    userEvent.click(screen.getByTestId("dashboard-name-heading"));
    userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
    // need to click away from the input to trigger the isDirty flag
    userEvent.tab();

    events.beforeunload?.();
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

  it("should not have a beforeunload event when the dashboard is unedited", async function () {
    const { events, mockEvent } = await setup();

    userEvent.click(screen.getByLabelText("Edit dashboard"));

    events.beforeunload?.();
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(undefined);
  });
});
