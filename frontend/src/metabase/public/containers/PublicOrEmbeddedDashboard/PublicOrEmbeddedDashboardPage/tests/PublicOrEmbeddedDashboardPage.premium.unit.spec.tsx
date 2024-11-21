import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, queryIcon, screen } from "__support__/ui";
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
  it("should not display the header if title is disabled and there is only one tab (metabase#41393) and downloads are disabled", async () => {
    await setupPremium({
      hash: { titled: "false", downloads: "false" },
      numberOfTabs: 1,
    });

    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embed-frame-header")).not.toBeInTheDocument();
  });

  describe("downloads flag", () => {
    it("should show the 'Export as PDF' button even when titled=false and there's one tab", async () => {
      await setupPremium({ hash: { titled: "false" }, numberOfTabs: 1 });

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it('should not show the "Export as PDF" button when downloads are disabled', async () => {
      await setupPremium({ hash: { downloads: "false" }, numberOfTabs: 1 });

      expect(screen.queryByText("Export as PDF")).not.toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: { downloads: "true" } });

      await userEvent.click(getIcon("ellipsis"));

      expect(screen.getByText("Download results")).toBeInTheDocument();
    });

    it("should not allow downloading the dashcards results when downloads are disabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: { downloads: "false" } });

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

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupPremium();

      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
    });

    it('should set the locale to "ko"', async () => {
      const expectedLocale = "ko";
      await setupPremium({ hash: { locale: expectedLocale } });

      expect(
        fetchMock.calls(`path:/app/locales/${expectedLocale}.json`),
      ).toHaveLength(1);
    });
  });
});
