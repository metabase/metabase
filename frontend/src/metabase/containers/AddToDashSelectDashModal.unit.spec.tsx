import React from "react";
import fetchMock from "fetch-mock";
import { Route } from "react-router";
import {
  setupMostRecentlyViewedDashboard,
  setupCollectionsEndpoints,
  setupSearchEndpoints,
  setupSingleCollectionEndpoint,
} from "__support__/server-mocks";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";
import { Collection, Dashboard } from "metabase-types/api";
import { AddToDashSelectDashModal } from "./AddToDashSelectDashModal";

const card = createMockCard({ id: 1, name: "Model Uno", dataset: true });
const DASHBOARD = createMockDashboard({
  id: 1,
  name: "Test dashboard",
  collection_id: 2,
});

const dashboards = {
  1: DASHBOARD,
};

const COLLECTION_1 = createMockCollection({
  id: 2,
  name: "C1",
  can_write: true,
});

const COLLECTION_2 = createMockCollection({
  id: 3,
  name: "C2",
  can_write: true,
});

interface SetupOpts {
  collections?: Collection[];
  error?: string;
  dashboard?: Dashboard | null;
}

const COLLECTIONS = [COLLECTION_1, COLLECTION_2];

const setup = ({
  collections = COLLECTIONS,
  dashboard = DASHBOARD,
  error,
}: SetupOpts = {}) => {
  const onChangeLocationMocked = jest.fn();
  const onCloseMocked = jest.fn();
  setupMostRecentlyViewedDashboard(dashboard ?? undefined);
  setupSearchEndpoints([]);
  setupCollectionsEndpoints(collections);

  if (!error) {
    setupSingleCollectionEndpoint(COLLECTION_1);
  } else {
    fetchMock.get("path:/api/collection/2", { status: 500, body: error });
  }

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <AddToDashSelectDashModal
          card={card}
          onChangeLocation={onChangeLocationMocked}
          onClose={onCloseMocked}
          dashboards={dashboards}
        />
      )}
    />,
    { withRouter: true },
  );

  return {
    onChangeLocationMocked,
    onCloseMocked,
  };
};

describe("AddToDashSelectDashModal", () => {
  describe("Create new Dashboard", () => {
    it("should open CreateDashboardModal", async () => {
      fetchMock.get("path:/api/collection/1", 200);
      fetchMock.get("path:/api/collection/2/items", []);

      setup();

      await waitForElementToBeRemoved(() =>
        screen.queryByTestId("loading-spinner"),
      );

      const createNewDashboard = screen.getByRole("heading", {
        name: /create a new dashboard/i,
      });

      fireEvent.click(createNewDashboard);

      // opened CreateDashboardModal
      expect(
        screen.getByRole("heading", {
          name: /new dashboard/i,
        }),
      ).toBeInTheDocument();
    });
  });

  describe("Add to existing Dashboard", () => {
    it("should show loading", () => {
      fetchMock.get("path:/api/collection/2/items", []);
      setup();

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });

    it("should show error", async () => {
      const ERROR = "Server Error!";
      fetchMock.get("path:/api/collection/2/items", []);
      setup({ error: ERROR });

      await waitForElementToBeRemoved(() =>
        screen.queryByTestId("loading-spinner"),
      );

      expect(screen.getByText(ERROR)).toBeInTheDocument();
    });

    describe("when user visited some dashboard in last 24hrs", () => {
      it("should preselected last visited dashboard in the picker", async () => {
        fetchMock.get("path:/api/collection/2/items", {
          data: [
            {
              name: DASHBOARD.name,
              id: DASHBOARD.id,
              model: "dashboard",
            },
          ],
        });

        setup();

        await waitForElementToBeRemoved(() =>
          screen.queryByTestId("loading-spinner"),
        );

        // breadcrumbs
        expect(screen.getByText(COLLECTION_1.name)).toBeInTheDocument();
        // dashboard item
        expect(screen.getByText(DASHBOARD.name)).toBeInTheDocument();
      });
    });

    describe("when user didn't visit any dashboard during last 24hrs", () => {
      it("should render root collection without preselection", async () => {
        fetchMock.get("path:/api/collection/root/items", []);

        setup({
          dashboard: null,
        });

        await waitForElementToBeRemoved(() =>
          screen.queryByTestId("loading-spinner"),
        );

        // list of collections on the root screen
        expect(screen.getByText(COLLECTION_1.name)).toBeInTheDocument();
        expect(screen.getByText(COLLECTION_2.name)).toBeInTheDocument();
      });
    });
  });
});
