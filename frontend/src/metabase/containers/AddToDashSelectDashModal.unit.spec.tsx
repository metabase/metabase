import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardCollectionItemsEndpoint,
  setupMostRecentlyViewedDashboard,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { Collection, Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";
import { useCollectionListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
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

const COLLECTION_1 = createMockCollection({
  id: 1,
  name: "C1",
  can_write: true,
});

const COLLECTION_2 = createMockCollection({
  id: 2,
  name: "C2",
  can_write: true,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id,
  name: "My personal collection",
  personal_owner_id: CURRENT_USER.id,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const COLLECTIONS = [
  ROOT_COLLECTION,
  COLLECTION_1,
  COLLECTION_2,
  PERSONAL_COLLECTION,
];

interface SetupOpts {
  collections?: Collection[];
  error?: string;
  dashboard?: Dashboard;
  noRecentDashboard?: boolean;
  waitForContent?: boolean;
}

const TestComponent: typeof AddToDashSelectDashModal = props => {
  const { data, error, isLoading } = useCollectionListQuery();

  if (!data) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return <AddToDashSelectDashModal {...props} />;
};

const setup = async ({
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
        <TestComponent
          card={CARD}
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
    });
  });
});
