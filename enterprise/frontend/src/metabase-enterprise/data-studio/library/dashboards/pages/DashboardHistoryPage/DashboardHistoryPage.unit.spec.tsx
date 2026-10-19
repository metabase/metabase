import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
  setupDashboardRevisionsEndpoint,
  setupRevertRevisionEndpoint,
} from "__support__/server-mocks";
import { setupListSubscriptionsEndpoint } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockRevision,
} from "metabase-types/api/mocks";

import { DashboardHistoryPage } from "./DashboardHistoryPage";

const LIBRARY = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
});
const DASHBOARDS = createMockCollection({
  id: 2,
  name: "Dashboards",
  type: "library-dashboards",
});
const SALES = createMockCollection({
  id: 3,
  name: "Sales",
  type: "library-dashboards",
  effective_ancestors: [LIBRARY, DASHBOARDS],
});
const EXAMPLES = createMockCollection({ id: 5, name: "Examples" });

const CREATED = createMockRevision({
  id: 1,
  description: "created this",
  timestamp: "2026-05-14T10:00:00Z",
});
const RENAMED = createMockRevision({
  id: 2,
  description: "renamed it",
  timestamp: "2026-05-16T10:00:00Z",
  is_creation: false,
});

type SetupOpts = {
  collectionId?: CollectionId;
  canWrite?: boolean;
  isRemoteSyncReadOnly?: boolean;
};

function setup({
  collectionId = SALES.id,
  canWrite = true,
  isRemoteSyncReadOnly = false,
}: SetupOpts = {}) {
  const dashboard = createMockDashboard({
    id: 10,
    name: "Sales overview",
    collection_id: collectionId,
    can_write: canWrite,
    dashcards: [],
  });
  setupListSubscriptionsEndpoint([]);
  setupDashboardEndpoints(dashboard);
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection(ROOT_COLLECTION),
      LIBRARY,
      DASHBOARDS,
      SALES,
      EXAMPLES,
    ],
  });
  setupDashboardRevisionsEndpoint(dashboard.id, [RENAMED, CREATED]);
  setupRevertRevisionEndpoint(CREATED);

  renderWithProviders(
    <Route
      path="/data-studio/dashboards/:dashboardId/history"
      element={<DashboardHistoryPage />}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "remote-sync-enabled": isRemoteSyncReadOnly,
          "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : undefined,
        }),
      }),
      withRouter: true,
      initialRoute: `/data-studio/dashboards/${dashboard.id}/history`,
    },
  );
}

describe("DashboardHistoryPage", () => {
  it("lists the dashboard's revisions newest first and reverts to an older one", async () => {
    setup();

    const list = await screen.findByTestId("dashboard-history-list");
    const events = within(list).getAllByTestId("revision-history-event");
    expect(events[0]).toHaveTextContent("renamed it");
    expect(events[1]).toHaveTextContent("created this");

    await userEvent.click(within(list).getByTestId("question-revert-button"));

    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/revision/revert")).toBe(
        true,
      ),
    );
    const call = fetchMock.callHistory.lastCall("path:/api/revision/revert");
    expect(await call?.request?.json()).toEqual({
      entity: "dashboard",
      id: 10,
      revision_id: CREATED.id,
    });
  });

  it.each([
    { name: "the user cannot write the dashboard", canWrite: false },
    { name: "remote sync is read-only", isRemoteSyncReadOnly: true },
  ])(
    "offers no revert when $name",
    async ({ canWrite, isRemoteSyncReadOnly }) => {
      setup({ canWrite, isRemoteSyncReadOnly });

      const list = await screen.findByTestId("dashboard-history-list");
      expect(
        within(list).getAllByTestId("revision-history-event"),
      ).toHaveLength(2);
      expect(
        within(list).queryByTestId("question-revert-button"),
      ).not.toBeInTheDocument();
    },
  );

  it("shows the Dashboards section and folders of a Library dashboard", async () => {
    setup();

    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      await within(header).findByRole("link", { name: "Sales" }),
    ).toHaveAttribute("href", "/data-studio/dashboards?expandedId=3");
    expect(
      within(header).getByRole("link", { name: "Dashboards" }),
    ).toHaveAttribute("href", "/data-studio/dashboards");
  });

  it("shows the collection path of a dashboard outside the Library", async () => {
    setup({ collectionId: EXAMPLES.id });

    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      await within(header).findByRole("link", { name: "Examples" }),
    ).toBeInTheDocument();
    expect(
      within(header).queryByRole("link", { name: "Dashboards" }),
    ).not.toBeInTheDocument();
  });
});
