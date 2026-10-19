import userEvent from "@testing-library/user-event";

import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { setupListSubscriptionsEndpoint } from "__support__/server-mocks/pulse";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { DashboardDependenciesPage } from "./DashboardDependenciesPage";

jest.mock("../../analytics");

const DASHBOARDS_COLLECTION = createMockCollection({
  id: 2,
  name: "Dashboards",
  type: "library-dashboards",
});

const DASHBOARD = createMockDashboard({
  id: 10,
  name: "Sales overview",
  collection_id: DASHBOARDS_COLLECTION.id,
});

const DEPENDENCIES_PATH = `/data-studio/dashboards/${DASHBOARD.id}/dependencies`;

type SetupOpts = {
  search: string;
};

function setup({ search }: SetupOpts) {
  setupDashboardEndpoints(DASHBOARD);
  setupListSubscriptionsEndpoint([]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION), DASHBOARDS_COLLECTION],
  });

  const { router } = renderWithProviders(
    <>
      <Route
        path="/data-studio/dashboards/:dashboardId/dependencies"
        element={<DashboardDependenciesPage />}
      />
      <Route path="/dashboard/:slug" element={null} />
    </>,
    {
      withRouter: true,
      initialRoute: `${DEPENDENCIES_PATH}${search}`,
    },
  );

  return { router };
}

describe("DashboardDependenciesPage", () => {
  it("opens the dashboard editor and asks it to return to this graph", async () => {
    const search = "?id=1&type=card";
    const { router } = setup({ search });

    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    await waitFor(() =>
      expect(router?.location).toMatchObject({
        pathname: "/dashboard/10-sales-overview",
        hash: "#edit",
        state: { returnTo: `${DEPENDENCIES_PATH}${search}` },
      }),
    );
  });
});
