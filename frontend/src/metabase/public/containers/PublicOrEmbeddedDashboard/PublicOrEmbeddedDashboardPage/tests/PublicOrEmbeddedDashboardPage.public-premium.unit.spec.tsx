import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import * as localization from "metabase/utils/localization";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MOCK_UUID, type SetupOpts, setup } from "./setup";

// the dashcards render with the interactive visualizations, as on a real public dashboard
jest.mock("metabase/static-viz/register", () => ({
  registerStaticVisualizations: jest.fn(),
}));
registerVisualizations();

const DASHBOARD_TITLE = "Test Dashboard";

// The public route registers request interceptors for the whole module and the
// enterprise plugins stay installed once set up, so the public link with a
// premium token gets its own spec file.
const ROW_COUNT = 200;

/** A scalar dashcard, so the test can tell when its results have rendered. */
function setupScalarDashcardResults() {
  fetchMock.get(
    `path:/api/public/dashboard/${MOCK_UUID}/dashcard/1/card/1`,
    createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
        rows: [[ROW_COUNT]],
      }),
    }),
  );
}

const getScalarDashcard = (tabId: number) => ({
  card: createMockCard({ id: tabId, display: "scalar", can_write: false }),
});

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
        setupScalarDashcardResults();
        await setupPublicPremium({ hash, getTabDashcard: getScalarDashcard });

        const dashcard = screen.getByTestId("dashcard");
        expect(
          await within(dashcard).findByText(String(ROW_COUNT)),
        ).toBeInTheDocument();
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
        setupScalarDashcardResults();
        await setupPublicPremium({ hash, getTabDashcard: getScalarDashcard });

        const dashcard = screen.getByTestId("dashcard");
        // the dashcard rendered its results, so the menu had its chance to show up
        expect(
          await within(dashcard).findByText(String(ROW_COUNT)),
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
});
