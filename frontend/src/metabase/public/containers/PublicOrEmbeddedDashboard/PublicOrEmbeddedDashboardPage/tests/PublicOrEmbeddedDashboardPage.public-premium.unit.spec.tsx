import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { act, screen, waitFor, within } from "__support__/ui";
import { refetchSiteSettings } from "metabase/settings";
import * as localization from "metabase/utils/localization";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

const DASHBOARD_TITLE = "Test Dashboard";

// The public route registers request interceptors for the whole module and the
// enterprise plugins stay installed once set up, so the public link with a
// premium token gets its own spec file.
const setupPublicPremium = (opts: Partial<SetupOpts> = {}) =>
  setup({
    dashboardTitle: DASHBOARD_TITLE,
    accessType: "public",
    enterprisePlugins: ["whitelabel", "resource_downloads"],
    tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
    ...opts,
  });

describe("PublicOrEmbeddedDashboardPage (public link, premium)", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("downloads hash parameter", () => {
    it.each([
      { hash: "", pdf: true },
      { hash: "downloads=false", pdf: false },
      { hash: "downloads=pdf", pdf: true },
      { hash: "downloads=results", pdf: false },
      // a browser keeps the space of `#downloads=results, pdf` encoded
      { hash: "downloads=results,%20pdf", pdf: true },
    ])(
      "with #$hash shows the PDF download button: $pdf",
      async ({ hash, pdf }) => {
        await setupPublicPremium({ hash });

        expect(
          screen.getByRole("heading", { name: DASHBOARD_TITLE }),
        ).toBeInTheDocument();
        const pdfButtons = within(
          screen.getByTestId("embed-frame-header"),
        ).queryAllByRole("button", { name: "Download as PDF" });
        expect(pdfButtons).toHaveLength(pdf ? 1 : 0);
      },
    );

    it.each(["", "downloads=results", "downloads=results,%20pdf"])(
      "with #%s allows downloading the dashcard results",
      async (hash) => {
        await setupPublicPremium({ hash });

        const dashcard = screen.getByTestId("dashcard");
        await userEvent.click(
          within(dashcard).getByTestId("public-or-embedded-dashcard-menu"),
        );

        expect(
          await screen.findByLabelText("Download results"),
        ).toBeInTheDocument();
      },
    );

    it.each(["downloads=false", "downloads=pdf"])(
      "with #%s does not allow downloading the dashcard results",
      async (hash) => {
        await setupPublicPremium({ hash });

        const dashcard = screen.getByTestId("dashcard");
        // the dashcard rendered its results, so the menu had its chance to show up
        expect(
          await within(dashcard).findByTestId("visualization-root"),
        ).toBeInTheDocument();
        expect(
          within(dashcard).queryByTestId("public-or-embedded-dashcard-menu"),
        ).not.toBeInTheDocument();
      },
    );
  });

  it("should set the window title to `{dashboard name} · {application name}` (metabase#62391)", async () => {
    await setupPublicPremium({
      withPublicApp: true,
      settings: { "application-name": "Custom Application Name" },
    });

    await waitFor(() =>
      expect(document.title).toBe(
        `${DASHBOARD_TITLE} · Custom Application Name`,
      ),
    );
  });

  it("should load the locale from the `#locale` hash parameter, falling back to its language (metabase#50182)", async () => {
    const loadLocalizationSpy = jest.spyOn(localization, "loadLocalization");

    // there is no de_CH catalogue among the available locales, only de
    await setupPublicPremium({ hash: { locale: "de-CH" } });

    expect(loadLocalizationSpy).toHaveBeenCalledWith("de");
    expect(loadLocalizationSpy).not.toHaveBeenCalledWith("de-CH");
  });

  it("should render when /api/session/properties answers with HTML (metabase#62501)", async () => {
    fetchMock.get("path:/api/session/properties", {
      status: 200,
      headers: { "Content-Type": "text/html" },
      body: "<html><body><h1>Those aren't the droids you're looking for</h1></body></html>",
    });
    const { store } = await setupPublicPremium({ withPublicApp: true });
    expect(
      await within(screen.getByTestId("dashcard")).findByTestId(
        "visualization-root",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      await store.dispatch(refetchSiteSettings());
    });

    expect(fetchMock.callHistory.called("path:/api/session/properties")).toBe(
      true,
    );
    expect(
      within(screen.getByTestId("embed-frame")).getByText(DASHBOARD_TITLE),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("dashcard")).getByTestId("visualization-root"),
    ).toBeInTheDocument();
  });
});
