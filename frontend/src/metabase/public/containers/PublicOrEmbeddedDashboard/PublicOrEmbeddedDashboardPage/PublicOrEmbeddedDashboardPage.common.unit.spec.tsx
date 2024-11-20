import userEvent from "@testing-library/user-event";

import { getIcon, screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";

import { type SetupOpts, setup } from "./setup";

const DASHBOARD_TITLE = '"My test dash"';

const setupCommon = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    dashboardTitle: DASHBOARD_TITLE,
  });
};

describe("PublicOrEmbeddedDashboardPage", () => {
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

    expect(screen.getByText("There's nothing here, yet.")).toBeInTheDocument();
  });

  describe("downloads flag", () => {
    it("should show the 'Export as PDF' button even when titled=false and there's one tab", async () => {
      await setupCommon({ hash: { titled: "false" }, numberOfTabs: 1 });

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it('should not hide the "Export as PDF" button when downloads are disabled without "whitelabel" feature', async () => {
      await setupCommon({ hash: { downloads: "false" }, numberOfTabs: 1 });

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setupCommon({ numberOfTabs: 1, hash: { downloads: "true" } });

      await userEvent.click(getIcon("ellipsis"));

      expect(screen.getByText("Download results")).toBeInTheDocument();
    });

    it('should not hide downloading menu in the dashcards when downloads are disabled without "whitelabel" feature', async () => {
      await setupCommon({ numberOfTabs: 1, hash: { downloads: "false" } });

      expect(getIcon("ellipsis")).toBeInTheDocument();
    });

    it("should use the container used for pdf exports", async () => {
      const { container } = await setupCommon({ numberOfTabs: 1 });

      expect(
        // eslint-disable-next-line testing-library/no-node-access -- this test is testing a specific implementation detail as testing the actual functionality is not easy on jest
        container.querySelector(`#${DASHBOARD_PDF_EXPORT_ROOT_ID}`),
      ).toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupCommon();

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it('should set not the locale to "ko" without "whitelabel" feature', async () => {
      await setupCommon({ hash: { locale: "ko" } });

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });
  });
});
