import { Route } from "react-router";
import _ from "underscore";

import { setupEmbedDashboardEndpoints } from "__support__/server-mocks/embed";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { DashboardCard, DashboardTab } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PublicOrEmbeddedDashboardPage } from "./PublicOrEmbeddedDashboardPage";

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";
const DASHBOARD_TITLE = '"My test dash"';

describe("PublicOrEmbeddedDashboardPage", () => {
  it("should display dashboard tabs", async () => {
    await setup({ numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display dashboard tabs if title is disabled (metabase#41195)", async () => {
    await setup({ hash: "titled=false", numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should not display the header if title is disabled and there is only one tab (metabase#41393)", async () => {
    await setup({ hash: "titled=false", numberOfTabs: 1 });

    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embed-frame-header")).not.toBeInTheDocument();
  });

  it("should display the header if title is enabled and there is only one tab", async () => {
    await setup({ numberOfTabs: 1, hash: "titled=true" });

    expect(screen.getByTestId("embed-frame-header")).toBeInTheDocument();
    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
  });

  it("should select the tab from the url", async () => {
    await setup({ queryString: "?tab=2", numberOfTabs: 3 });

    const secondTab = screen.getByRole("tab", { name: "Tab 2" });

    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("should work with ?tab={tabid}-${tab-name}", async () => {
    // note: as all slugs this is ignored and we only use the id
    await setup({
      queryString: "?tab=2-this-is-the-tab-name",
      numberOfTabs: 3,
    });

    const secondTab = screen.getByRole("tab", { name: "Tab 2" });

    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("should default to the first tab if the one passed on the url doesn't exist", async () => {
    await setup({ queryString: "?tab=1111", numberOfTabs: 3 });

    const firstTab = screen.getByRole("tab", { name: "Tab 1" });

    expect(firstTab).toHaveAttribute("aria-selected", "true");
  });

  it("should render when a filter passed with value starting from '0' (metabase#41483)", async () => {
    // note: as all slugs this is ignored and we only use the id
    await setup({
      queryString: "?my-filter-value=01",
    });

    // should not throw runtime error and render dashboard content
    expect(screen.getByText(DASHBOARD_TITLE)).toBeInTheDocument();
  });

  it("should render empty message for dashboard without cards", async () => {
    await setup({
      numberOfTabs: 0,
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("There's nothing here, yet.")).toBeInTheDocument();
  });
});

async function setup({
  hash,
  queryString,
  numberOfTabs = 1,
}: { hash?: string; queryString?: string; numberOfTabs?: number } = {}) {
  const tabs: DashboardTab[] = [];
  const dashcards: DashboardCard[] = [];

  _.times(numberOfTabs, i => {
    const tabId = i + 1;

    tabs.push(createMockDashboardTab({ id: tabId, name: `Tab ${tabId}` }));
    dashcards.push(
      createMockDashboardCard({
        id: i + 1,
        card_id: i + 1,
        card: createMockCard({ id: i + 1 }),
        dashboard_tab_id: tabId,
      }),
    );
  });

  const dashboard = createMockDashboard({
    id: 1,
    name: DASHBOARD_TITLE,
    parameters: [],
    dashcards,
    tabs,
  });

  setupEmbedDashboardEndpoints(MOCK_TOKEN, dashboard, dashcards);

  renderWithProviders(
    <Route
      path="embed/dashboard/:token"
      component={PublicOrEmbeddedDashboardPage}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `embed/dashboard/${MOCK_TOKEN}${
        queryString ? `?` + queryString : ""
      }${hash ? "#" + hash : ""}`,
    },
  );

  if (numberOfTabs > 0) {
    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
  }
}
