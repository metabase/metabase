import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { setupDependencyGraphEndpoint } from "__support__/server-mocks/dependencies";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockDashboard,
  createMockDependencyGraph,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { getDataStudioDashboardRoutes } from "./routes";

const DASHBOARD = createMockDashboard({ id: 10, name: "Sales overview" });
const CONTENTS_PATH = "/data-studio/dashboards/10/contents";
const DEPENDENCIES_PATH = "/data-studio/dashboards/10/dependencies";

type SetupOpts = {
  initialRoute: string;
};

function setup({ initialRoute }: SetupOpts) {
  setupDashboardEndpoints(DASHBOARD);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupDependencyGraphEndpoint(createMockDependencyGraph());

  renderWithProviders(
    <>
      <Route path="/data-studio">{getDataStudioDashboardRoutes()}</Route>
      <Route path="*" element={<div>No route matched</div>} />
    </>,
    { withRouter: true, initialRoute },
  );
}

// Plugins stay initialized for the rest of the file, so the cases without the
// dependencies plugin run first
describe("Data Studio dashboard routes without the dependencies plugin", () => {
  it("has no Dependencies tab", async () => {
    setup({ initialRoute: CONTENTS_PATH });

    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      within(header).getByRole("link", { name: "Contents" }),
    ).toBeInTheDocument();
    expect(
      within(header).queryByRole("link", { name: "Dependencies" }),
    ).not.toBeInTheDocument();
  });

  it("has no Dependencies page", async () => {
    setup({ initialRoute: DEPENDENCIES_PATH });

    expect(await screen.findByText("No route matched")).toBeInTheDocument();
  });
});

describe("Data Studio dashboard routes with the dependencies plugin", () => {
  beforeAll(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    });
    setupEnterpriseOnlyPlugin("dependencies");
  });

  it("links the Dependencies tab to the dashboard's dependency graph", async () => {
    setup({ initialRoute: CONTENTS_PATH });

    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      within(header).getByRole("link", { name: "Dependencies" }),
    ).toHaveAttribute("href", DEPENDENCIES_PATH);
  });

  it("renders the Dependencies page with its tab selected", async () => {
    setup({ initialRoute: DEPENDENCIES_PATH });

    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      within(header).getByRole("link", { name: "Dependencies" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("No route matched")).not.toBeInTheDocument();
  });
});
