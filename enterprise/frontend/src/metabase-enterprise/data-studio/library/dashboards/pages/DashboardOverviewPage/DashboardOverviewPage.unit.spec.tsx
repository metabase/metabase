import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockDashboardQueryMetadata,
} from "metabase-types/api/mocks";

import { trackDataStudioDashboardEditStarted } from "../../analytics";

import { DashboardOverviewPage } from "./DashboardOverviewPage";

jest.mock("../../analytics");

const LIBRARY_COLLECTION = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
});

const DASHBOARDS_COLLECTION = createMockCollection({
  id: 2,
  name: "Dashboards",
  type: "library-dashboards",
});

const SALES_COLLECTION = createMockCollection({
  id: 3,
  name: "Sales",
  type: "library-dashboards",
  effective_ancestors: [LIBRARY_COLLECTION, DASHBOARDS_COLLECTION],
});

type SetupOpts = {
  dashboard?: Partial<Dashboard>;
  isNotFound?: boolean;
};

function setup({ dashboard: dashboardOpts, isNotFound = false }: SetupOpts) {
  const dashboard = createMockDashboard({
    id: 10,
    name: "Sales overview",
    collection_id: SALES_COLLECTION.id,
    dashcards: [],
    ...dashboardOpts,
  });
  if (isNotFound) {
    setupDashboardNotFoundEndpoint(dashboard);
  } else {
    setupDashboardEndpoints(dashboard);
  }
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata(),
  );
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection(ROOT_COLLECTION),
      LIBRARY_COLLECTION,
      DASHBOARDS_COLLECTION,
      SALES_COLLECTION,
    ],
  });

  const { router } = renderWithProviders(
    <>
      <Route
        path="/data-studio/dashboards/:dashboardId"
        element={<DashboardOverviewPage />}
      />
      <Route path="/dashboard/:slug" element={null} />
    </>,
    {
      withRouter: true,
      initialRoute: `/data-studio/dashboards/${dashboard.id}`,
    },
  );

  return { router };
}

describe("DashboardOverviewPage", () => {
  it("shows a loader, then the dashboard name and its folder breadcrumbs", async () => {
    setup({});

    await waitForLoaderToBeRemoved();
    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      within(header).getByRole("link", { name: "Dashboards" }),
    ).toHaveAttribute("href", "/data-studio/dashboards");
    expect(
      await within(header).findByRole("link", { name: "Sales" }),
    ).toBeInTheDocument();
    // The title and the last breadcrumb
    expect(within(header).getAllByText("Sales overview")).toHaveLength(2);
    expect(screen.getByTestId("dashboard-preview")).toBeInTheDocument();
  });

  it("fetches the dashboard once for the header and the preview", async () => {
    setup({});

    expect(await screen.findByTestId("dashboard-preview")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/dashboard/10/query_metadata"),
      ).toBe(true),
    );
    expect(
      fetchMock.callHistory.calls("path:/api/dashboard/10", { method: "GET" }),
    ).toHaveLength(1);
  });

  it("shows the description in the info sidebar", async () => {
    setup({ dashboard: { description: "Revenue by region" } });

    const info = await screen.findByTestId("dashboard-info");
    expect(within(info).getByText("Revenue by region")).toBeInTheDocument();
    expect(within(info).queryByText("No description")).not.toBeInTheDocument();
  });

  it("says when the dashboard has no description", async () => {
    setup({ dashboard: { description: null } });

    const info = await screen.findByTestId("dashboard-info");
    expect(within(info).getByText("No description")).toBeInTheDocument();
  });

  it("hides Edit when the user cannot write the dashboard", async () => {
    setup({ dashboard: { can_write: false } });

    expect(
      await screen.findByRole("link", { name: /View/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Edit/ }),
    ).not.toBeInTheDocument();
  });

  it("hides Edit and shows the trash banner when the dashboard is archived", async () => {
    setup({ dashboard: { archived: true, can_restore: true } });

    expect(await screen.findByTestId("archive-banner")).toHaveTextContent(
      "This dashboard is in the trash.",
    );
    expect(
      await screen.findByRole("link", { name: /View/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Edit/ }),
    ).not.toBeInTheDocument();
  });

  it("restores an archived dashboard from the trash banner", async () => {
    setup({ dashboard: { archived: true, can_restore: true } });

    const banner = await screen.findByTestId("archive-banner");
    await userEvent.click(within(banner).getByText("Restore"));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/dashboard/10", {
          method: "PUT",
        }),
      ).toBe(true),
    );
    const body: unknown = fetchMock.callHistory.lastCall(
      "path:/api/dashboard/10",
      { method: "PUT" },
    )?.options.body;
    expect(body).toBe(JSON.stringify({ archived: false }));
  });

  it("does not show the trash banner for a dashboard that is not archived", async () => {
    setup({});

    expect(
      await screen.findByRole("button", { name: /Edit/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("archive-banner")).not.toBeInTheDocument();
  });

  it("opens the dashboard editor and asks it to return here", async () => {
    const { router } = setup({});

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    await waitFor(() =>
      expect(router?.location).toMatchObject({
        pathname: "/dashboard/10-sales-overview",
        hash: "#edit",
        state: { returnTo: "/data-studio/dashboards/10" },
      }),
    );
    expect(
      jest.mocked(trackDataStudioDashboardEditStarted),
    ).toHaveBeenCalledTimes(1);
    expect(
      jest.mocked(trackDataStudioDashboardEditStarted),
    ).toHaveBeenCalledWith(10);
  });

  it("shows an error when the dashboard cannot be loaded", async () => {
    setup({ isNotFound: true });

    await waitForLoaderToBeRemoved();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-overview-page"),
    ).not.toBeInTheDocument();
  });
});
