import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardModal, type DashboardModalType } from "./DashboardModal";

const ROOT = createMockCollection(ROOT_COLLECTION);
const SALES = createMockCollection({
  id: 3,
  name: "Sales",
  type: "library-dashboards",
});
const EXAMPLES_ID = 5;
const EXAMPLES = createMockCollection({ id: EXAMPLES_ID, name: "Examples" });

const DASHBOARD = createMockDashboard({
  id: 10,
  name: "Sales overview",
  collection_id: SALES.id,
  dashcards: [],
});

type SetupOpts = {
  modalType: DashboardModalType;
  dashboard?: Dashboard;
};

function setup({ modalType, dashboard = DASHBOARD }: SetupOpts) {
  const onClose = jest.fn();
  setupDashboardEndpoints(dashboard, { updatedDashboard: dashboard });
  setupCollectionByIdEndpoint({ collections: [ROOT, SALES, EXAMPLES] });

  const { router } = renderWithProviders(
    <Route
      path="/data-studio/dashboards/:dashboardId"
      element={
        <DashboardModal
          dashboard={dashboard}
          modalType={modalType}
          onClose={onClose}
        />
      }
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `/data-studio/dashboards/${dashboard.id}`,
    },
  );

  return { onClose, router };
}

function setupPickerEndpoints() {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [SALES, EXAMPLES],
    rootCollection: ROOT,
  });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      createMockCollectionItem({
        id: EXAMPLES_ID,
        model: "collection",
        name: EXAMPLES.name,
        collection_id: null,
        can_write: true,
      }),
    ],
  });
  setupCollectionItemsEndpoint({ collection: ROOT, collectionItems: [] });
  setupCollectionItemsEndpoint({ collection: SALES, collectionItems: [] });
  setupCollectionItemsEndpoint({ collection: EXAMPLES, collectionItems: [] });
  setupSearchEndpoints([]);
  setupUserRecipientsEndpoint({ users: [] });
}

async function getLastRequestBody(
  matcher: string,
  method: "PUT" | "POST",
): Promise<unknown> {
  return fetchMock.callHistory.lastCall(matcher, { method })?.request?.json();
}

describe("DashboardModal", () => {
  describe("move", () => {
    it("moves the dashboard to any collection the picker offers", async () => {
      setupPickerEndpoints();
      const { onClose } = setup({ modalType: "move" });

      expect(await screen.findByText("Move dashboard to…")).toBeInTheDocument();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("Examples"));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Move",
        }),
      );

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(
        await getLastRequestBody("path:/api/dashboard/10", "PUT"),
      ).toMatchObject({
        collection_id: EXAMPLES.id,
      });
      expect(await screen.findByText(/Dashboard moved to/)).toBeInTheDocument();
    });
  });

  describe("duplicate", () => {
    const COPY = createMockDashboard({
      id: 42,
      name: "Sales overview - Duplicate",
    });

    it("opens the copy in Data Studio when it is saved in the Library", async () => {
      fetchMock.post("path:/api/dashboard/10/copy", COPY);
      const { onClose, router } = setup({ modalType: "duplicate" });

      await userEvent.click(
        await screen.findByRole("button", { name: "Duplicate" }),
      );

      await waitFor(() =>
        expect(router?.location.pathname).toBe("/data-studio/dashboards/42"),
      );
      expect(onClose).toHaveBeenCalled();
      expect(
        await getLastRequestBody("path:/api/dashboard/10/copy", "POST"),
      ).toMatchObject({
        name: "Sales overview - Duplicate",
        collection_id: SALES.id,
      });
    });

    it("opens the copy in Data Studio when it is saved outside the Library", async () => {
      setupPickerEndpoints();
      fetchMock.post("path:/api/dashboard/10/copy", {
        ...COPY,
        collection_id: EXAMPLES_ID,
      });
      const { onClose, router } = setup({ modalType: "duplicate" });

      await userEvent.click(
        await screen.findByRole("button", {
          name: /Which collection should this go in/,
        }),
      );
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(await screen.findByText("Examples"));
      await userEvent.click(screen.getByRole("button", { name: "Select" }));
      await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

      await waitFor(() =>
        expect(router?.location.pathname).toBe("/data-studio/dashboards/42"),
      );
      expect(onClose).toHaveBeenCalled();
      expect(
        await getLastRequestBody("path:/api/dashboard/10/copy", "POST"),
      ).toMatchObject({ collection_id: EXAMPLES_ID });
    });
  });

  describe("trash", () => {
    it("moves the dashboard to the trash", async () => {
      const { onClose } = setup({ modalType: "trash" });

      expect(
        await screen.findByText("Move this dashboard to trash?"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Are you sure you want to do this?"),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Move to trash" }),
      );

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(
        await getLastRequestBody("path:/api/dashboard/10", "PUT"),
      ).toMatchObject({
        archived: true,
      });
    });

    it("warns that the dashboard's own questions go with it", async () => {
      setup({
        modalType: "trash",
        dashboard: createMockDashboard({
          ...DASHBOARD,
          dashcards: [
            createMockDashboardCard({
              card: createMockCard({ dashboard_id: DASHBOARD.id }),
            }),
          ],
        }),
      });

      expect(
        await screen.findByText(
          "This will trash the dashboard and the questions that are saved in it. Are you sure you want to do this?",
        ),
      ).toBeInTheDocument();
    });
  });
});
