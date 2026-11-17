import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitForLoaderToBeRemoved, within } from "__support__/ui";
import { PLUGIN_API } from "metabase/api/client";
import * as embeddingConfig from "metabase/embedding/config";
import { setupEmbedPreviewRewrite } from "metabase/embedding/lib/override-requests-for-embeds";
import {
  createMockActionDashboardCard,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";
import {
  RC1,
  createTimeSeriesDashcard,
  expectReadOnlyDashboardEvents,
  setupTimeSeriesChart,
} from "./timeline-events";

// `timeline-events` registers the interactive visualizations the charts need
jest.mock("metabase/static-viz/register", () => ({
  registerStaticVisualizations: jest.fn(),
}));

const DASHBOARD_TITLE = '"My test dash"';

const setupCommon = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    dashboardTitle: DASHBOARD_TITLE,
  });
};

// the preview case installs the production rewrite; teardown puts the default back
const DEFAULT_REWRITE_EMBED_PREVIEW_URL =
  PLUGIN_API.onBeforeRequestHandlers.rewriteEmbedPreviewUrl;

const EMBED_DASHBOARD_PATH = "http://localhost/api/embed/dashboard/";
const PREVIEW_DASHBOARD_PATH = "http://localhost/api/preview_embed/dashboard/";

describe("PublicOrEmbeddedDashboardPage", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("shows the grid skeleton, not the empty state, while the dashboard loads", async () => {
    const { releaseDashboardRequest } = await setupCommon({
      holdDashboardRequest: true,
    });

    try {
      expect(
        await screen.findByTestId("dashboard-grid-skeleton"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("This dashboard is empty"),
      ).not.toBeInTheDocument();
    } finally {
      releaseDashboardRequest();
    }

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-grid-skeleton"),
    ).not.toBeInTheDocument();
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

  it("should hide action buttons on a static embed dashboard (metabase#34395)", async () => {
    await setupCommon({
      hasEmbedBranding: true,
      extraDashcards: [
        createMockActionDashboardCard({
          id: 100,
          action: createMockImplicitQueryAction({ name: "Create" }),
          visualization_settings: {
            ...createMockActionDashboardCard().visualization_settings,
            "button.label": "Create row",
          },
        }),
      ],
    });

    expect(
      screen.getByRole("heading", { name: DASHBOARD_TITLE }),
    ).toBeInTheDocument();
    const grid = screen.getByTestId("dashboard-grid");
    expect(within(grid).getAllByTestId("dashcard")).toHaveLength(1);
    expect(within(grid).queryByText("Create row")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Powered by Metabase" }),
    ).toBeInTheDocument();
  });

  describe("timeline events", () => {
    afterEach(() => {
      jest.restoreAllMocks();
      PLUGIN_API.onBeforeRequestHandlers.rewriteEmbedPreviewUrl =
        DEFAULT_REWRITE_EMBED_PREVIEW_URL;
    });

    it("shows only the saved events, read-only, on a static embed dashboard", async () => {
      jest.spyOn(embeddingConfig, "isStaticEmbedding").mockReturnValue(true);
      setupTimeSeriesChart();
      await setupCommon({ extraDashcards: [createTimeSeriesDashcard([RC1])] });

      await expectReadOnlyDashboardEvents();
      expect(
        fetchMock.callHistory.called(`begin:${EMBED_DASHBOARD_PATH}`),
      ).toBe(true);
    });

    // Metabase iframed in itself, with the production rewrite sending `/api/embed`
    // requests to `/api/preview_embed`
    it("shows only the saved events, read-only, in a dashboard embed preview", async () => {
      jest.spyOn(embeddingConfig, "isStaticEmbedding").mockReturnValue(true);
      jest.spyOn(embeddingConfig, "isEmbedPreview").mockReturnValue(true);
      setupEmbedPreviewRewrite();
      setupTimeSeriesChart();
      await setupCommon({
        extraDashcards: [createTimeSeriesDashcard([RC1])],
        embedPreview: true,
      });

      await expectReadOnlyDashboardEvents();
      expect(
        fetchMock.callHistory.called(`begin:${PREVIEW_DASHBOARD_PATH}`),
      ).toBe(true);
      expect(
        fetchMock.callHistory.called(`begin:${EMBED_DASHBOARD_PATH}`),
      ).toBe(false);
    });
  });
});
