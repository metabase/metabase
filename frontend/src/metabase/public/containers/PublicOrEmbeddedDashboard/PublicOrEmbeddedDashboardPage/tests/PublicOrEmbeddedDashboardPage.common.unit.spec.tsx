import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import {
  createMockActionDashboardCard,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

const DASHBOARD_TITLE = '"My test dash"';

const setupCommon = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    dashboardTitle: DASHBOARD_TITLE,
  });
};

describe("PublicOrEmbeddedDashboardPage", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should hide action dashcards on public/embedded dashboards (metabase#34395)", async () => {
    await setupCommon({
      extraDashcards: [
        createMockActionDashboardCard({
          id: 100,
          card_id: null,
          dashboard_tab_id: 1,
          // a defined `action` (unlike the factory's default `undefined`, which
          // JSON serialization would strip) is what marks this an action dashcard
          action: createMockImplicitQueryAction(),
        }),
      ],
    });

    // the normal question dashcard still renders
    expect(screen.getByText("Question")).toBeInTheDocument();

    // the action dashcard is filtered out: only the question dashcard renders
    const dashcards = screen.getAllByTestId("dashcard");
    expect(dashcards).toHaveLength(1);
    expect(dashcards[0]).toHaveAttribute("data-dashcard-key", "1");
  });

  it("should display dashboard tabs", async () => {
    await setupCommon({ numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display dashboard tabs if title is disabled (metabase#41195)", async () => {
    await setupCommon({ hash: { titled: "false" }, numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display the header if title is enabled and there is only one tab", async () => {
    await setupCommon({ numberOfTabs: 1, hash: { titled: "true" } });

    expect(screen.getByTestId("embed-frame-header")).toBeInTheDocument();
    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
  });

  it("should select the tab from the url", async () => {
    await setupCommon({ queryString: "?tab=2", numberOfTabs: 3 });

    const secondTab = screen.getByRole("tab", { name: "Tab 2" });

    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("should work with ?tab={tabid}-${tab-name}", async () => {
    // note: as all slugs this is ignored and we only use the id
    await setupCommon({
      queryString: "?tab=2-this-is-the-tab-name",
      numberOfTabs: 3,
    });

    const secondTab = screen.getByRole("tab", { name: "Tab 2" });

    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("should default to the first tab if the one passed on the url doesn't exist", async () => {
    await setupCommon({ queryString: "?tab=1111", numberOfTabs: 3 });

    const firstTab = screen.getByRole("tab", { name: "Tab 1" });

    expect(firstTab).toHaveAttribute("aria-selected", "true");
  });

  it("should render when a filter passed with value starting from '0' (metabase#41483)", async () => {
    // note: as all slugs this is ignored and we only use the id
    await setupCommon({
      queryString: "?my-filter-value=01",
    });

    // should not throw runtime error and render dashboard content
    expect(screen.getByText(DASHBOARD_TITLE)).toBeInTheDocument();
  });

  it("should render empty message for dashboard without cards", async () => {
    await setupCommon({
      numberOfTabs: 0,
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("This dashboard is empty")).toBeInTheDocument();
  });
});
