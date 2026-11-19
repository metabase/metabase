import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
  setupEntityRevisionsEndpoint,
  setupForbiddenCardEndpoints,
  setupMetricDatasetEndpoint,
  setupMetricEndpoint,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { setupAuditInfoEndpoint } from "__support__/server-mocks/audit";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { PERMISSION_ERROR } from "__support__/server-mocks/constants";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { createMockState } from "__support__/state";
import {
  act,
  renderRoutes,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route, toRouteObjects } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockMetric,
  createMockMetricDimension,
  createMockNumericColumn,
  createMockRevision,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getMetricRoutes } from "../../routes";

import { MetricAboutPage } from "./MetricAboutPage";

registerVisualizations();

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;

function makeMetricCard(opts: Partial<Card> = {}): Card {
  return createMockCard({
    id: CARD_ID,
    type: "metric",
    name: "Count of Orders",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    },
    ...opts,
  });
}

function setupBaseEndpoints(card: Card) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupMetricEndpoint(createMockMetric({ id: card.id, name: card.name }));
}

function renderPage() {
  renderWithProviders(
    <Route path="/metric/:cardId" element={<MetricAboutPage />} />,
    {
      withRouter: true,
      initialRoute: `/metric/${CARD_ID}`,
    },
  );
}

describe("MetricAboutPage", () => {
  it("renders the unauthorized state (no tabs) when the metric query is forbidden", async () => {
    setupBaseEndpoints(makeMetricCard());
    fetchMock.post(`path:/api/card/${CARD_ID}/query`, {
      status: 403,
      body: PERMISSION_ERROR,
    });

    renderPage();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "About" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "History" }),
    ).not.toBeInTheDocument();
  });

  it("renders the unauthorized state when the card itself is not readable", async () => {
    setupDatabaseEndpoints(SAMPLE_DB);
    setupForbiddenCardEndpoints(CARD_ID);

    renderPage();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "About" }),
    ).not.toBeInTheDocument();
  });
});

const CREATED_AT_DIMENSION_ID = "created-at";

type SetupRoutesOpts = {
  card?: Partial<Card>;
  canQueryData?: boolean;
};

function setupStatefulCardEndpoints(initialCard: Card) {
  let card = initialCard;
  fetchMock.get(`path:/api/card/${card.id}`, () => card, {
    name: "card-get",
  });
  fetchMock.put(
    `path:/api/card/${card.id}`,
    async (call) => {
      const changes: Partial<Card> = JSON.parse(String(call.options.body));
      card = { ...card, ...changes };
      return card;
    },
    { name: "card-put" },
  );
}

function setupMetricRoutes({
  card: cardOverrides,
  canQueryData = true,
}: SetupRoutesOpts = {}) {
  const card = makeMetricCard({
    name: "Orders count",
    description: "Total number of orders",
    can_write: true,
    result_metadata: [
      createMockField({ name: "count", base_type: "type/Integer" }),
    ],
    ...cardOverrides,
  });
  const queryMetadata = createMockCardQueryMetadata({
    databases: canQueryData ? [SAMPLE_DB] : [],
  });
  if (canQueryData) {
    setupDatabaseEndpoints(SAMPLE_DB);
  } else {
    const forbidden = { status: 403, body: PERMISSION_ERROR };
    fetchMock.get(`path:/api/database/${SAMPLE_DB_ID}`, forbidden);
    fetchMock.get(`path:/api/table/${ORDERS_ID}`, forbidden);
  }
  setupStatefulCardEndpoints(card);
  setupCardQueryMetadataEndpoint(card, queryMetadata);
  setupAdhocQueryMetadataEndpoint(queryMetadata);
  setupNotificationChannelsEndpoints({
    email: { configured: false },
    slack: { configured: false },
    http: { configured: false },
  });
  setupWebhookChannelsEndpoint([]);
  setupCardQueryEndpoints(card, SCALAR_DATASET);
  setupMetricEndpoint(
    createMockMetric({
      id: card.id,
      name: card.name,
      dimensions: [
        createMockMetricDimension({
          id: CREATED_AT_DIMENSION_ID,
          display_name: "Created At",
          effective_type: "type/DateTime",
          semantic_type: "type/CreationTimestamp",
          status: "status/active",
          default: false,
        }),
      ],
      dimension_mappings: [
        {
          dimension_id: CREATED_AT_DIMENSION_ID,
          table_id: ORDERS_ID,
          target: ["field", {}, ORDERS.CREATED_AT],
        },
      ],
    }),
  );
  setupMetricDatasetEndpoint(SCALAR_DATASET);
  setupCollectionsEndpoints({ collections: [createMockCollection()] });
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);
  setupAuditInfoEndpoint({ auditInfo: {} });
  setupEntityRevisionsEndpoint("card", card.id, [
    createMockRevision({ id: 2, description: "renamed this" }),
    createMockRevision({ id: 1, description: "created this" }),
  ]);

  return renderRoutes(toRouteObjects(<Route>{getMetricRoutes()}</Route>), {
    initialRoute: `/metric/${CARD_ID}`,
    withUndos: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });
}

const SCALAR_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockNumericColumn({ name: "count" })],
    rows: [[18760]],
  }),
});

async function getPutBody(): Promise<unknown> {
  await waitFor(() => {
    expect(fetchMock.callHistory.calls("card-put")).toHaveLength(1);
  });
  return JSON.parse(
    String(fetchMock.callHistory.lastCall("card-put")?.options.body),
  );
}

describe("metric pages", () => {
  it("previews a scalar metric with its description and source", async () => {
    setupMetricRoutes();

    const aboutPage = within(await screen.findByTestId("metric-about-page"));
    expect(await aboutPage.findByTestId("scalar-value")).toHaveTextContent(
      "18,760",
    );
    expect(aboutPage.getByTestId("visualization-root")).toHaveAttribute(
      "data-viz-ui-name",
      "Number",
    );
    expect(
      aboutPage.queryByRole("button", { name: /^Select dimension/ }),
    ).not.toBeInTheDocument();
    const datasetRequest = await fetchMock.callHistory
      .lastCall("metric-dataset")
      ?.request?.json();
    expect(datasetRequest).toEqual({
      definition: expect.not.objectContaining({
        projections: expect.anything(),
      }),
    });
    const sidebar = within(aboutPage.getByTestId("metric-description-sidebar"));
    expect(sidebar.getByText("Total number of orders")).toBeInTheDocument();
    expect(sidebar.getByText("Source")).toBeInTheDocument();
    expect(await sidebar.findByText("Sample Database")).toBeInTheDocument();
    expect(await sidebar.findByText("Orders")).toBeInTheDocument();
    expect(screen.getByTestId("explore-link")).toHaveAttribute(
      "href",
      `/explore?metricId=${CARD_ID}`,
    );
  });

  it("edits the description and the name, and navigates between the tabs", async () => {
    const { router } = setupMetricRoutes();

    const sidebar = within(
      await screen.findByTestId("metric-description-sidebar"),
    );
    await userEvent.click(sidebar.getByText("Total number of orders"));
    const descriptionInput = sidebar.getByRole("textbox");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Updated description");
    await userEvent.tab();
    expect(await getPutBody()).toEqual({
      description: "Updated description",
    });
    expect(await sidebar.findByText("Updated description")).toBeInTheDocument();
    fetchMock.callHistory.clear();

    const header = within(screen.getByTestId("metric-header"));
    const nameInput = header.getByDisplayValue("Orders count");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed metric{enter}");
    expect(await getPutBody()).toEqual({
      name: "Renamed metric",
    });
    expect(header.getByDisplayValue("Renamed metric")).toBeInTheDocument();

    for (const tab of ["About", "Overview", "Definition", "History"]) {
      expect(
        await header.findByRole("link", { name: tab }),
      ).toBeInTheDocument();
    }

    await userEvent.click(header.getByRole("link", { name: "Overview" }));
    const overviewPage = within(
      await screen.findByTestId("metric-overview-page"),
    );
    expect(router?.location.pathname).toBe(`/metric/${CARD_ID}/overview`);
    expect(await overviewPage.findByText("By Created At")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("link", {
        name: "Definition",
      }),
    );
    const queryEditor = within(
      await screen.findByTestId("metric-query-editor"),
    );
    expect(router?.location.pathname).toBe(`/metric/${CARD_ID}/query`);
    expect(
      within(await queryEditor.findByTestId("step-data-0-0")).getByText(
        "Orders",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("link", {
        name: "History",
      }),
    );
    const history = within(
      await screen.findByTestId("saved-question-history-list"),
    );
    const events = history.getAllByTestId("revision-history-event");
    expect(events[0]).toHaveTextContent("renamed this");
    expect(events[1]).toHaveTextContent("created this");

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("link", {
        name: "About",
      }),
    );
    expect(await screen.findByTestId("metric-about-page")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(`/metric/${CARD_ID}`);
  });

  it("discards unsaved definition changes on leaving (metabase#32037), cancels them, and saves them", async () => {
    const { router } = setupMetricRoutes();
    await act(() => router?.navigate(`/metric/${CARD_ID}/query`));

    const queryEditor = within(
      await screen.findByTestId("metric-query-editor"),
    );
    await queryEditor.findByTestId("step-summarize-0-0");
    expect(
      queryEditor.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();

    await changeCountToSumOfTotal();
    expect(
      await queryEditor.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("link", {
        name: "About",
      }),
    );
    const leaveModal = within(await screen.findByRole("dialog"));
    expect(leaveModal.getByText("Discard your changes?")).toBeInTheDocument();
    await userEvent.click(
      leaveModal.getByRole("button", { name: "Discard changes" }),
    );
    expect(await screen.findByTestId("metric-about-page")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(`/metric/${CARD_ID}`);

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("link", {
        name: "Definition",
      }),
    );
    expect(
      await within(await getSummarizeStep()).findByText("Count"),
    ).toBeInTheDocument();

    await changeCountToSumOfTotal();
    const editor = within(screen.getByTestId("metric-query-editor"));
    await userEvent.click(
      await editor.findByRole("button", { name: "Cancel" }),
    );
    expect(
      await within(await getSummarizeStep()).findByText("Count"),
    ).toBeInTheDocument();
    expect(
      editor.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("card-put")).toHaveLength(0);

    await changeCountToSumOfTotal();
    await userEvent.click(await editor.findByRole("button", { name: "Save" }));
    const body = await getPutBody();
    expect(body).toMatchObject({
      dataset_query: {
        stages: [
          {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "sum",
                expect.any(Object),
                ["field", expect.any(Object), ORDERS.TOTAL],
              ],
            ],
          },
        ],
      },
    });
    expect(await screen.findByText("Metric query updated")).toBeInTheDocument();
    expect(
      within(await getSummarizeStep()).getByText("Sum of Total"),
    ).toBeInTheDocument();
  });

  it("offers to set up a channel when creating an alert without any", async () => {
    setupMetricRoutes();

    await screen.findByTestId("metric-about-page");
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    const createAlertItem = await screen.findByRole("menuitem", {
      name: /Create an alert/,
    });
    // The item is disabled until the metric's alerts have loaded
    await waitFor(() => {
      expect(createAlertItem).toBeEnabled();
    });
    await userEvent.click(createAlertItem);

    const modal = within(await screen.findByRole("dialog"));
    expect(
      await modal.findByText(
        "To get notified when something happens, or to send this chart on a schedule, first set up email, Slack, or a webhook.",
      ),
    ).toBeInTheDocument();
    expect(modal.getByRole("link", { name: /Set up email/ })).toHaveAttribute(
      "href",
      "/admin/settings/email",
    );
    expect(modal.getByRole("link", { name: /Set up Slack/ })).toHaveAttribute(
      "href",
      "/admin/settings/slack",
    );
    expect(modal.getByRole("link", { name: /Add a webhook/ })).toHaveAttribute(
      "href",
      "/admin/settings/webhooks",
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("hides the editing controls and the overview and definition tabs from read-only users", async () => {
    setupMetricRoutes({ card: { can_write: false }, canQueryData: false });

    await screen.findByTestId("metric-about-page");
    const header = within(screen.getByTestId("metric-header"));
    expect(header.getByText("Orders count")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Orders count")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    const menu = within(await screen.findByRole("menu"));
    expect(menu.getByText("Bookmark")).toBeInTheDocument();
    expect(menu.getByText("Add to a dashboard")).toBeInTheDocument();
    expect(menu.queryByText("Move")).not.toBeInTheDocument();
    expect(menu.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(menu.queryByText("Move to trash")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(header.getByRole("link", { name: "History" })).toBeInTheDocument();
    expect(
      header.queryByRole("link", { name: "Overview" }),
    ).not.toBeInTheDocument();
    expect(
      header.queryByRole("link", { name: "Definition" }),
    ).not.toBeInTheDocument();
  });
});

async function getSummarizeStep() {
  return screen.findByTestId("step-summarize-0-0");
}

async function changeCountToSumOfTotal() {
  const step = within(await getSummarizeStep());
  await userEvent.click(await step.findByText("Count"));
  const popover = within(await screen.findByRole("dialog"));
  await userEvent.click(await popover.findByText("Sum of ..."));
  await userEvent.click(await popover.findByText("Total"));
}
