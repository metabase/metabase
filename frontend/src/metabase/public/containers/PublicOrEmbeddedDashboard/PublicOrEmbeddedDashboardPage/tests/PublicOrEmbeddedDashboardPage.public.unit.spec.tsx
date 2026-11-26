import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import type { Parameter, TimelineEvent } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockImplicitQueryAction,
  createMockParameter,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MOCK_UUID, type SetupOpts, setup } from "./setup";
import {
  RC1,
  RC2,
  createTimeSeriesDashcard,
  expectReadOnlyDashboardEvents,
  findEventChip,
  getTimeSeriesDashCard,
  getTimelineRequests,
  setupTimeSeriesChart,
} from "./timeline-events";

// `timeline-events` registers the interactive visualizations the charts need
jest.mock("metabase/static-viz/register", () => ({
  registerStaticVisualizations: jest.fn(),
}));

const DASHBOARD_TITLE = "Actions Dashboard";

const TEXT_FILTER = createMockParameter({
  id: "1",
  name: "Text",
  slug: "text",
  type: "string/=",
  sectionId: "string",
  values_query_type: "none",
});

const UNUSED_FILTER = createMockParameter({
  id: "2",
  name: "Number",
  slug: "number",
  type: "number/=",
  sectionId: "number",
});

const COUNT_ALL = 200;
const COUNT_DOOHICKEY = 42;

// The question dashcard of tab 1 is the only one mapped to the text filter
const DASHCARD_ID = 1;
const CARD_ID = 1;
const DASHCARD_QUERY_PATH = `path:/api/public/dashboard/${MOCK_UUID}/dashcard/${DASHCARD_ID}/card/${CARD_ID}`;

type QueryParameter = Pick<Parameter, "id"> & {
  type?: unknown;
  value?: unknown;
};

function getQueryParameters(url: string): unknown {
  return JSON.parse(new URL(url).searchParams.get("parameters") ?? "[]");
}

function isQueryParameterList(value: unknown): value is QueryParameter[] {
  return Array.isArray(value);
}

/** Answers the count for the text filter the request carries, as the backend filters the rows. */
function setupFilteredCountEndpoint() {
  fetchMock.get(DASHCARD_QUERY_PATH, (call) => {
    const parameters = getQueryParameters(call.url);
    const textFilter = isQueryParameterList(parameters)
      ? parameters.find((parameter) => parameter.id === TEXT_FILTER.id)
      : undefined;
    // the backend rejects a value whose type does not match the dashboard parameter
    const isDoohickey =
      textFilter?.type === "string/=" &&
      Array.isArray(textFilter.value) &&
      textFilter.value.includes("Doohickey");

    return createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count", base_type: "type/Integer" })],
        rows: [[isDoohickey ? COUNT_DOOHICKEY : COUNT_ALL]],
      }),
    });
  });
}

function getDashcardQueryParameters() {
  return fetchMock.callHistory
    .calls(DASHCARD_QUERY_PATH)
    .map((call) => getQueryParameters(call.url));
}

const setupFilteredDashboard = (opts: Partial<SetupOpts> = {}) =>
  setup({
    dashboardTitle: DASHBOARD_TITLE,
    accessType: "public",
    numberOfTabs: 2,
    ...opts,
    dashboard: {
      parameters: [TEXT_FILTER, UNUSED_FILTER],
      ...opts.dashboard,
    },
    getTabDashcard: (tabId) => ({
      card: createMockCard({ id: tabId, display: "scalar", can_write: false }),
      parameter_mappings:
        tabId === 1
          ? [
              {
                parameter_id: TEXT_FILTER.id,
                card_id: CARD_ID,
                target: ["dimension", ["template-tag", "c"]],
              },
            ]
          : [],
    }),
  });

async function addTextFilterValue(value: string) {
  await userEvent.click(screen.getByRole("button", { name: TEXT_FILTER.name }));
  const popover = await screen.findByTestId("parameter-value-dropdown");
  await userEvent.type(within(popover).getByRole("combobox"), `${value},`);
  await userEvent.click(
    within(popover).getByRole("button", { name: "Add filter" }),
  );
}

// The public route registers request interceptors for the whole module, so it
// gets its own spec file instead of sharing one with the static embed route.
describe("PublicOrEmbeddedDashboardPage (public link)", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should hide action buttons on a public dashboard (metabase#34395)", async () => {
    await setup({
      dashboardTitle: DASHBOARD_TITLE,
      accessType: "public",
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

  describe("filters", () => {
    it("should run the dashcard query with a filter value from the dashboard filter", async () => {
      setupFilteredCountEndpoint();
      await setupFilteredDashboard();

      expect(await screen.findByText(String(COUNT_ALL))).toBeInTheDocument();

      await addTextFilterValue("Doohickey");

      expect(
        await screen.findByText(String(COUNT_DOOHICKEY)),
      ).toBeInTheDocument();
      expect(getDashcardQueryParameters().at(-1)).toEqual([
        expect.objectContaining({
          id: TEXT_FILTER.id,
          type: "string/=",
          value: ["Doohickey"],
        }),
      ]);
    });

    it("should respect 'disable auto-apply filters'", async () => {
      setupFilteredCountEndpoint();
      await setupFilteredDashboard({
        dashboard: { auto_apply_filters: false },
      });

      expect(await screen.findByText(String(COUNT_ALL))).toBeInTheDocument();
      expect(
        screen.queryByTestId("filter-apply-toast"),
      ).not.toBeInTheDocument();
      const queryCountBeforeApply = getDashcardQueryParameters().length;

      await addTextFilterValue("Doohickey");

      const toast = await screen.findByTestId("filter-apply-toast");
      expect(
        within(toast).getByRole("button", { name: "Apply" }),
      ).toBeInTheDocument();
      expect(screen.getByText(String(COUNT_ALL))).toBeInTheDocument();
      expect(getDashcardQueryParameters()).toHaveLength(queryCountBeforeApply);

      await userEvent.click(
        within(toast).getByRole("button", { name: "Apply" }),
      );

      expect(
        await screen.findByText(String(COUNT_DOOHICKEY)),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("filter-apply-toast"),
      ).not.toBeInTheDocument();
      expect(getDashcardQueryParameters().at(-1)).toEqual([
        expect.objectContaining({
          id: TEXT_FILTER.id,
          type: "string/=",
          value: ["Doohickey"],
        }),
      ]);
    });

    it("should only display filters mapped to cards on the selected tab", async () => {
      await setupFilteredDashboard();

      const parameters = screen.getByTestId(
        "dashboard-parameters-widget-container",
      );
      expect(
        within(parameters).getByText(TEXT_FILTER.name),
      ).toBeInTheDocument();
      expect(
        within(parameters).queryByText(UNUSED_FILTER.name),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));

      await waitFor(() =>
        expect(
          screen.queryByTestId("dashboard-parameters-widget-container"),
        ).not.toBeInTheDocument(),
      );
      const embedFrame = screen.getByTestId("embed-frame");
      expect(
        within(embedFrame).queryByText(TEXT_FILTER.name),
      ).not.toBeInTheDocument();
      expect(
        within(embedFrame).queryByText(UNUSED_FILTER.name),
      ).not.toBeInTheDocument();
    });

    it("should keep a filter value starting with '0' from the URL (metabase#41483)", async () => {
      setupFilteredCountEndpoint();
      const { router } = await setupFilteredDashboard({
        queryString: "?text=002",
      });

      expect(screen.getByTestId("parameter-widget")).toHaveTextContent("002");
      await waitFor(() =>
        expect(getDashcardQueryParameters().at(-1)).toEqual([
          expect.objectContaining({
            id: TEXT_FILTER.id,
            type: "string/=",
            value: ["002"],
          }),
        ]),
      );
      await waitFor(() =>
        expect(new URLSearchParams(router?.location.search).get("tab")).toBe(
          "1-tab-1",
        ),
      );
      expect(new URLSearchParams(router?.location.search).get("text")).toBe(
        "002",
      );
    });
  });

  describe("timeline events", () => {
    const setupTimelineEvents = async (timelineEvents: TimelineEvent[]) => {
      jest.spyOn(embeddingConfig, "isPublicEmbedding").mockReturnValue(true);
      setupTimeSeriesChart();
      await setup({
        dashboardTitle: DASHBOARD_TITLE,
        accessType: "public",
        extraDashcards: [createTimeSeriesDashcard(timelineEvents)],
      });
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("shows only the saved events, read-only", async () => {
      await setupTimelineEvents([RC1]);

      await expectReadOnlyDashboardEvents();
    });

    it("opens the read-only details of a single chip with the keyboard", async () => {
      await setupTimelineEvents([RC1]);
      const chip = await findEventChip(RC1.name);

      chip.focus();
      expect(chip).toHaveFocus();
      await userEvent.keyboard("{Enter}");

      const popover = await screen.findByTestId("timeline-event-popover");
      // the keyboard-opened details take the focus, so Escape has to return it
      await waitFor(() => expect(chip).not.toHaveFocus());
      expect(within(popover).getByText(RC1.name)).toBeInTheDocument();
      expect(
        within(popover).getByText("The first release candidate is ready."),
      ).toBeInTheDocument();
      expect(within(popover).queryByText("See all")).not.toBeInTheDocument();
      expect(within(popover).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("dashboard-events-sidebar"),
      ).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("timeline-event-popover"),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(chip).toHaveFocus());

      await userEvent.hover(chip);
      expect(
        within(await screen.findByTestId("timeline-event-popover")).getByText(
          RC1.name,
        ),
      ).toBeInTheDocument();
      expect(getTimelineRequests()).toEqual([]);
    });

    it("lists every event of a grouped chip with the keyboard", async () => {
      await setupTimelineEvents([RC1, RC2]);
      const chip = await findEventChip("2 events");

      chip.focus();
      expect(chip).toHaveFocus();
      await userEvent.keyboard("{Enter}");

      const popover = await screen.findByTestId("timeline-event-popover");
      // the keyboard-opened details take the focus, so Escape has to return it
      await waitFor(() => expect(chip).not.toHaveFocus());
      expect(within(popover).getByText(RC1.name)).toBeInTheDocument();
      expect(within(popover).getByText(RC2.name)).toBeInTheDocument();
      expect(within(popover).queryByText("See all")).not.toBeInTheDocument();
      expect(within(popover).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("dashboard-events-sidebar"),
      ).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("timeline-event-popover"),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(chip).toHaveFocus());
      expect(getTimelineRequests()).toEqual([]);
    });
  });

  describe("development watermark", () => {
    it.each([true, false])(
      "shows the watermark on a chart only in development mode (development mode: %s)",
      async (isDevelopmentMode) => {
        setupTimeSeriesChart();
        await setup({
          dashboardTitle: DASHBOARD_TITLE,
          accessType: "public",
          extraDashcards: [createTimeSeriesDashcard([])],
          tokenFeatures: createMockTokenFeatures({
            development_mode: isDevelopmentMode,
          }),
        });

        const dashcard = await waitFor(() => getTimeSeriesDashCard());
        // the chart redraws its axis labels and detaches the found node, so only wait for it
        await within(dashcard).findByText("Created At: Month");
        expect(
          within(dashcard).queryAllByTestId("development-watermark"),
        ).toHaveLength(isDevelopmentMode ? 1 : 0);
      },
    );
  });
});
