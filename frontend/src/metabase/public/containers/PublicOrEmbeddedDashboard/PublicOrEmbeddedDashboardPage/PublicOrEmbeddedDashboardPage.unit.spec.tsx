import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupEmbedDashboardEndpoints } from "__support__/server-mocks/embed";
import { mockSettings } from "__support__/settings";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import registerVisualizations from "metabase/visualizations/register";
import type { DashboardCard, DashboardTab } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PublicOrEmbeddedDashboardPage } from "./PublicOrEmbeddedDashboardPage";

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";
const DASHBOARD_TITLE = '"My test dash"';

registerVisualizations();

describe("PublicOrEmbeddedDashboardPage", () => {
  beforeAll(() => {
    mockSettings({
      // the `whitelabel` feature is needed to test #downloads=false
      "token-features": createMockTokenFeatures({ whitelabel: true }),
    });

    setupEnterprisePlugins();
  });

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

  it("should not display the header if title is disabled and there is only one tab (metabase#41393) and downloads are disabled", async () => {
    await setup({ hash: "titled=false&downloads=false", numberOfTabs: 1 });

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

  describe("downloads flag", () => {
    it("should show the 'Export as PDF' button even when titled=false and there's one tab", async () => {
      await setup({ hash: "titled=false", numberOfTabs: 1 });

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it('should not show the "Export as PDF" button when downloads are disabled', async () => {
      await setup({ hash: "downloads=false", numberOfTabs: 1 });

      expect(screen.queryByText("Export as PDF")).not.toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setup({ numberOfTabs: 1, hash: "downloads=true" });

      await userEvent.click(getIcon("ellipsis"));

      expect(screen.getByText("Download results")).toBeInTheDocument();
    });

    it("should not allow downloading the dashcards results when downloads are disabled", async () => {
      await setup({ numberOfTabs: 1, hash: "downloads=false" });

      // in this case the dashcard menu would be empty so it's not rendered at all
      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
    });

    it("should use the container used for pdf exports", async () => {
      const { container } = await setup({ numberOfTabs: 1 });

      expect(
        // eslint-disable-next-line testing-library/no-node-access -- this test is testing a specific implementation detail as testing the actual functionality is not easy on jest
        container.querySelector(`#${DASHBOARD_PDF_EXPORT_ROOT_ID}`),
      ).toBeInTheDocument();
    });
  });
});

async function setup({
  hash,
  queryString = "",
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
        card: createMockCard({
          id: i + 1,
          //`can_write` is false in public or embedded contexts
          // without this we'd have the "Edit" button in the dashcard menu
          can_write: false,
        }),
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

  const pathname = `/embed/dashboard/${MOCK_TOKEN}`;
  const hashString = hash ? `#${hash}` : "";
  const href = `${pathname}${queryString}${hashString}`;

  // Setting initial window.location state,
  // so it can be used by getInitialSelectedTabId
  window.history.replaceState({}, "", href);

  const view = renderWithProviders(
    <Route
      path="embed/dashboard/:token"
      component={PublicOrEmbeddedDashboardPage}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: href,
    },
  );

  if (numberOfTabs > 0) {
    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
  }

  return view;
}
