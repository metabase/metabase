import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupAuditInfoEndpoint,
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { setupDependencyGraphEndpoint } from "__support__/server-mocks/dependencies";
import {
  setupListSubscriptionsEndpoint,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { reinitialize } from "metabase/plugins";
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
const USAGE_PATH = "/data-studio/dashboards/10/usage";
const SUBSCRIPTIONS_PATH = "/data-studio/dashboards/10/subscriptions";
const SUBSCRIPTION_PATH = "/data-studio/dashboards/10/subscriptions/1";
const AUDIT_DASHBOARD = createMockDashboard({
  id: 201,
  name: "Dashboard overview",
});

type SetupOpts = {
  initialRoute: string;
  hasUsageAnalyticsAccess?: boolean;
};

function setup({ initialRoute, hasUsageAnalyticsAccess = true }: SetupOpts) {
  setupDashboardEndpoints(DASHBOARD);
  setupDashboardEndpoints(AUDIT_DASHBOARD);
  setupListSubscriptionsEndpoint([]);
  setupBookmarksEndpoints([]);
  setupNotificationChannelsEndpoints({});
  setupAuditInfoEndpoint({
    auditInfo: hasUsageAnalyticsAccess
      ? { dashboard_overview: AUDIT_DASHBOARD.id }
      : {},
  });
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

beforeEach(() => {
  reinitialize();
});

describe("Data Studio dashboard routes without plugins", () => {
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

  it("has no Usage stats tab", async () => {
    setup({ initialRoute: CONTENTS_PATH });

    const header = await screen.findByTestId("dashboard-pane-header");
    expect(
      within(header).queryByRole("link", { name: "Usage stats" }),
    ).not.toBeInTheDocument();
  });

  it("has no Usage stats page", async () => {
    setup({ initialRoute: USAGE_PATH });

    expect(await screen.findByText("No route matched")).toBeInTheDocument();
  });

  it.each([SUBSCRIPTIONS_PATH, SUBSCRIPTION_PATH])(
    "renders the Subscriptions page with its tab selected at %s",
    async (initialRoute) => {
      setup({ initialRoute });

      expect(
        await screen.findByTestId("dashboard-subscriptions-page"),
      ).toBeInTheDocument();
      const header = screen.getByTestId("dashboard-pane-header");
      expect(
        within(header).getByRole("link", { name: "Subscriptions" }),
      ).toHaveAttribute("aria-current", "page");
    },
  );
});

describe("Data Studio dashboard routes with the dependencies plugin", () => {
  beforeEach(() => {
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

describe("Data Studio dashboard routes with the audit app plugin", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        dependencies: true,
        audit_app: true,
      }),
    });
    setupEnterpriseOnlyPlugin("dependencies");
    setupEnterpriseOnlyPlugin("audit_app");
  });

  it("puts the Usage stats tab between Dependencies and History", async () => {
    setup({ initialRoute: CONTENTS_PATH });

    const header = await screen.findByTestId("dashboard-pane-header");
    const usageTab = await within(header).findByRole("link", {
      name: "Usage stats",
    });
    expect(usageTab).toHaveAttribute("href", USAGE_PATH);
    expect(
      within(within(header).getByRole("navigation"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual([
      "Overview",
      "Contents",
      "Dependencies",
      "Usage stats",
      "History",
      "Subscriptions",
    ]);
  });

  it("hides the Usage stats tab without access to Usage analytics", async () => {
    setup({ initialRoute: USAGE_PATH, hasUsageAnalyticsAccess: false });

    expect(
      await screen.findByText(
        "To see usage stats, you need access to the Usage analytics collection.",
      ),
    ).toBeInTheDocument();
    const header = screen.getByTestId("dashboard-pane-header");
    expect(
      within(header).queryByRole("link", { name: "Usage stats" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Usage stats page with its tab selected", async () => {
    setup({ initialRoute: USAGE_PATH });

    expect(
      await screen.findByTestId("dashboard-usage-stats-page"),
    ).toBeInTheDocument();
    const header = screen.getByTestId("dashboard-pane-header");
    expect(
      await within(header).findByRole("link", { name: "Usage stats" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
