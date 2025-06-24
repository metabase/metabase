import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";

import { type SetupOpts, setup } from "./setup";

const DASHBOARD_TITLE = '"My test dash"';

const setupEnterprise = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    hasEnterprisePlugins: true,
    dashboardTitle: DASHBOARD_TITLE,
  });
};

describe("PublicOrEmbeddedDashboardPage", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  describe("downloads flag", () => {
    it("should show the 'Download as PDF' button even when titled=false and there's one tab", async () => {
      await setupEnterprise({ hash: { titled: "false" }, numberOfTabs: 1 });

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it('should not hide the "Download as PDF" button when downloads are disabled without "whitelabel" feature', async () => {
      await setupEnterprise({ hash: { downloads: "false" }, numberOfTabs: 1 });

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setupEnterprise({ numberOfTabs: 1, hash: { downloads: "true" } });

      expect(
        screen.getByRole("button", { name: "Download results" }),
      ).toBeInTheDocument();
    });

    it("should use the container used for pdf exports", async () => {
      const { container } = await setupEnterprise({ numberOfTabs: 1 });

      expect(
        container.querySelector(`#${DASHBOARD_PDF_EXPORT_ROOT_ID}`),
      ).toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupEnterprise();

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it('should not set the locale to "ko" without "whitelabel" feature', async () => {
      const expectedLocale = "ko";
      await setupEnterprise({ hash: { locale: expectedLocale } });

      expect(
        fetchMock.calls(`path:/app/locales/${expectedLocale}.json`),
      ).toHaveLength(0);
    });
  });
});
