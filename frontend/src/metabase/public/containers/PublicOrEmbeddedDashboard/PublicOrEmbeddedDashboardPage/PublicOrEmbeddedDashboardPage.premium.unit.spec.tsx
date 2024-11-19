import userEvent from "@testing-library/user-event";

import {
  getIcon,
  queryIcon,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

const DASHBOARD_TITLE = '"My test dash"';

const setupPremium = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      // the `whitelabel` feature is needed to test #downloads=false
      whitelabel: true,
    }),
    hasEnterprisePlugins: true,
    dashboardTitle: DASHBOARD_TITLE,
  });
};

describe("PublicOrEmbeddedDashboardPage", () => {
  it("should display dashboard tabs", async () => {
    await setupPremium({ numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should display dashboard tabs if title is disabled (metabase#41195)", async () => {
    await setupPremium({ hash: "titled=false", numberOfTabs: 2 });

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("should not display the header if title is disabled and there is only one tab (metabase#41393) and downloads are disabled", async () => {
    await setupPremium({
      hash: "titled=false&downloads=false",
      numberOfTabs: 1,
    });

    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embed-frame-header")).not.toBeInTheDocument();
  });

  it("should display the header if title is enabled and there is only one tab", async () => {
    await setupPremium({ numberOfTabs: 1, hash: "titled=true" });

    expect(screen.getByTestId("embed-frame-header")).toBeInTheDocument();
    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
  });

  it("should select the tab from the url", async () => {
    await setupPremium({ queryString: "?tab=2", numberOfTabs: 3 });

    const secondTab = screen.getByRole("tab", { name: "Tab 2" });

    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("should work with ?tab={tabid}-${tab-name}", async () => {
    // note: as all slugs this is ignored and we only use the id
    await setupPremium({
      queryString: "?tab=2-this-is-the-tab-name",
      numberOfTabs: 3,
    });

    const secondTab = screen.getByRole("tab", { name: "Tab 2" });

    expect(secondTab).toHaveAttribute("aria-selected", "true");
  });

  it("should default to the first tab if the one passed on the url doesn't exist", async () => {
    await setupPremium({ queryString: "?tab=1111", numberOfTabs: 3 });

    const firstTab = screen.getByRole("tab", { name: "Tab 1" });

    expect(firstTab).toHaveAttribute("aria-selected", "true");
  });

  it("should render when a filter passed with value starting from '0' (metabase#41483)", async () => {
    // note: as all slugs this is ignored and we only use the id
    await setupPremium({
      queryString: "?my-filter-value=01",
    });

    // should not throw runtime error and render dashboard content
    expect(screen.getByText(DASHBOARD_TITLE)).toBeInTheDocument();
  });

  it("should render empty message for dashboard without cards", async () => {
    await setupPremium({
      numberOfTabs: 0,
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("There's nothing here, yet.")).toBeInTheDocument();
  });

  describe("downloads flag", () => {
    it("should show the 'Export as PDF' button even when titled=false and there's one tab", async () => {
      await setupPremium({ hash: "titled=false", numberOfTabs: 1 });

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it('should not show the "Export as PDF" button when downloads are disabled', async () => {
      await setupPremium({ hash: "downloads=false", numberOfTabs: 1 });

      expect(screen.queryByText("Export as PDF")).not.toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: "downloads=true" });

      await userEvent.click(getIcon("ellipsis"));

      expect(screen.getByText("Download results")).toBeInTheDocument();
    });

    it("should not allow downloading the dashcards results when downloads are disabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: "downloads=false" });

      // in this case the dashcard menu would be empty so it's not rendered at all
      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
    });

    it("should use the container used for pdf exports", async () => {
      const { container } = await setupPremium({ numberOfTabs: 1 });

      expect(
        // eslint-disable-next-line testing-library/no-node-access -- this test is testing a specific implementation detail as testing the actual functionality is not easy on jest
        container.querySelector(`#${DASHBOARD_PDF_EXPORT_ROOT_ID}`),
      ).toBeInTheDocument();
    });
  });
});
