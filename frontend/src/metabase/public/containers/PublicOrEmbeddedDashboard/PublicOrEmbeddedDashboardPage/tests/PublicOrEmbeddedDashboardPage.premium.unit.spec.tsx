import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

const DASHBOARD_TITLE = '"My test dash"';

const setupPremium = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    enterprisePlugins: ["whitelabel", "resource_downloads"],
    tokenFeatures: createMockTokenFeatures({
      // the `whitelabel` feature is needed to test #downloads=false
      whitelabel: true,
    }),
    dashboardTitle: DASHBOARD_TITLE,
  });
};

describe("PublicOrEmbeddedDashboardPage", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should not display the header if title is disabled and there is only one tab (metabase#41393) and downloads are disabled", async () => {
    await setupPremium({
      hash: { titled: "false", downloads: "false" },
      numberOfTabs: 1,
    });

    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embed-frame-header")).not.toBeInTheDocument();
  });

  describe("downloads flag", () => {
    it("should show the 'Download as PDF' button even when titled=false and there's one tab", async () => {
      await setupPremium({ hash: { titled: "false" }, numberOfTabs: 1 });

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it('should not show the "Download as PDF" button when downloads are disabled', async () => {
      await setupPremium({ hash: { downloads: "false" }, numberOfTabs: 1 });

      expect(
        screen.queryByRole("button", { name: "Download as PDF" }),
      ).not.toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: { downloads: "true" } });

      const ellipsisIcon = screen.queryByLabelText("ellipsis icon");
      expect(ellipsisIcon).toBeInTheDocument();
      await userEvent.click(ellipsisIcon!);
      await waitFor(() => {
        expect(screen.getByLabelText("Download results")).toBeInTheDocument();
      });
    });

    it("should not allow downloading the dashcards results when downloads are disabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: { downloads: "false" } });

      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", { name: "Download results" }),
      ).not.toBeInTheDocument();
    });

    it("should use the container used for pdf exports", async () => {
      const { container } = await setupPremium({ numberOfTabs: 1 });

      expect(
        // eslint-disable-next-line testing-library/no-node-access
        container.querySelector(`#${DASHBOARD_PDF_EXPORT_ROOT_ID}`),
      ).toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupPremium();

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it('should set the locale to "ko"', async () => {
      const expectedLocale = "ko";
      await setupPremium({ hash: { locale: expectedLocale } });

      expect(
        fetchMock.callHistory.calls(`path:/app/locales/${expectedLocale}.json`),
      ).toHaveLength(1);
    });
  });
});
