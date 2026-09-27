import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableQueryMetadataEndpoint } from "__support__/server-mocks";
import {
  setupJevCreateDashboardEndpoint,
  setupJevCreateIntentEndpoint,
  setupJevCreateQuestionEndpoint,
} from "__support__/server-mocks/jev";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  JevCreateIntent,
  JevDashboardPlan,
  JevQuestionPlan,
} from "metabase/api/jev-create";
import type { JevQuestionColumn } from "metabase/api/jev-filters";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { getJevQuestionColumns } from "metabase/querying/jev-filters/question-utils";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockDashboard,
  createMockDocument,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { JevCreatePalette } from "./JevCreatePalette";

const PERSONAL_COLLECTION_ID = 42;
const NEW_DASHBOARD_ID = 7;
const NEW_DOCUMENT_ID = 9;

function getOrdersColumns(): JevQuestionColumn[] {
  const table = Lib.tableOrCardMetadata(SAMPLE_PROVIDER, ORDERS_ID);
  if (!table) {
    throw new Error("No Orders table");
  }
  const query = Lib.queryFromTableOrCardMetadata(SAMPLE_PROVIDER, table);
  return Array.from(getJevQuestionColumns(query).values(), ({ info }) => info);
}

const COLUMNS = getOrdersColumns();

function getColumnKey(displayName: string) {
  const column = COLUMNS.find((column) => column.display_name === displayName);
  if (!column) {
    throw new Error(`No column ${displayName}`);
  }
  return column.key;
}

const INTENT: JevCreateIntent = {
  status: "ok",
  elapsed_ms: 210,
  jev_ms: 180,
  kind: {
    choice: "question",
    probabilities: { question: 0.9, dashboard: 0.07, document: 0.03 },
  },
  tables: [
    {
      id: ORDERS_ID,
      db_id: SAMPLE_DB_ID,
      name: "ORDERS",
      display_name: "Orders",
      schema: "PUBLIC",
      probability: 0.98,
      relevance: 0.9,
    },
    {
      id: PRODUCTS_ID,
      db_id: SAMPLE_DB_ID,
      name: "PRODUCTS",
      display_name: "Products",
      schema: "PUBLIC",
      probability: 0.01,
      relevance: 0.6,
    },
  ],
};

const QUESTION_PLAN: JevQuestionPlan = {
  status: "ok",
  elapsed_ms: 260,
  jev_ms: 240,
  filters: [
    {
      parameter_id: getColumnKey("User → State"),
      parameter_name: "User → State",
      parameter_type: "string/=",
      value: ["TX"],
      label: "TX",
      confidence: 0.93,
      alternatives: [],
    },
  ],
  aggregation: {
    options: [
      {
        operator: "count",
        column_key: null,
        label: "Count of rows",
        probability: 0.99,
      },
      {
        operator: "sum",
        column_key: getColumnKey("Subtotal"),
        label: "Sum of Subtotal",
        probability: 0.01,
      },
    ],
  },
  breakout: {
    options: [
      {
        column_key: getColumnKey("Created At"),
        label: "Created At",
        probability: 1,
      },
      { column_key: null, label: "No grouping", probability: 0 },
    ],
  },
  temporal_unit: {
    options: [
      { unit: "month", label: "Month", probability: 1 },
      { unit: "default", label: "Default", probability: 0 },
    ],
  },
  display: {
    options: [
      { display: "line", label: "Line chart", probability: 1 },
      { display: "auto", label: "Automatic", probability: 0 },
    ],
  },
};

const DASHBOARD_PLAN: JevDashboardPlan = {
  status: "ok",
  elapsed_ms: 400,
  jev_ms: 380,
  name: "Sales overview",
  tables: [{ id: ORDERS_ID, display_name: "Orders" }],
  cards: [
    {
      card_id: 11,
      name: "Total orders",
      display: "scalar",
      table_id: ORDERS_ID,
      collection_name: "Sales",
      probability: 0.85,
      selected: true,
    },
    {
      card_id: 12,
      name: "Revenue by category",
      display: "bar",
      table_id: ORDERS_ID,
      collection_name: null,
      probability: 0.3,
      selected: false,
    },
  ],
};

const DOCUMENT_PLAN: JevDashboardPlan = {
  ...DASHBOARD_PLAN,
  name: "Sales write-up",
  cards: [
    { ...DASHBOARD_PLAN.cards[1], selected: true },
    { ...DASHBOARD_PLAN.cards[0], selected: true },
  ],
};

interface SetupOpts {
  intent?: JevCreateIntent;
  dashboardPlan?: JevDashboardPlan;
}

function setup({
  intent = INTENT,
  dashboardPlan = DASHBOARD_PLAN,
}: SetupOpts = {}) {
  setupJevCreateIntentEndpoint(intent);
  setupJevCreateQuestionEndpoint(QUESTION_PLAN);
  setupJevCreateDashboardEndpoint({
    dashboard: dashboardPlan,
    document: DOCUMENT_PLAN,
  });
  fetchMock.post(
    "path:/api/document",
    createMockDocument({ id: NEW_DOCUMENT_ID, name: DOCUMENT_PLAN.name }),
  );
  setupTableQueryMetadataEndpoint(createOrdersTable());
  fetchMock.post(
    "path:/api/dashboard",
    createMockDashboard({ id: NEW_DASHBOARD_ID, name: dashboardPlan.name }),
  );
  fetchMock.put(
    `path:/api/dashboard/${NEW_DASHBOARD_ID}`,
    createMockDashboard({ id: NEW_DASHBOARD_ID }),
  );

  const onClose = jest.fn();
  const { router } = renderWithProviders(
    <JevCreatePalette opened onClose={onClose} />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({
          personal_collection_id: PERSONAL_COLLECTION_ID,
        }),
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
  );
  const input = screen.getByRole("combobox", {
    name: "Describe what to create",
  });
  const getLocation = () => {
    if (!router) {
      throw new Error("No router");
    }
    return router.location;
  };
  return { input, onClose, getLocation };
}

async function getRequestBody(url: string) {
  const call = fetchMock.callHistory.lastCall(url);
  const body = await call?.request?.clone().json();
  return body;
}

async function getPlanRequestBodies() {
  const calls = fetchMock.callHistory.calls("path:/api/jev/create/dashboard");
  return Promise.all(calls.map((call) => call.request?.clone().json()));
}

function getRow(name: string) {
  return screen.getByRole("option", { name });
}

function getSelectedChip(rowName: string) {
  return within(getRow(rowName)).getByRole("button", { pressed: true });
}

describe("JevCreatePalette", () => {
  it("plans a question, a dashboard and a document as soon as the intent arrives", async () => {
    const { input } = setup();
    await userEvent.type(input, "orders in texas by month");

    expect(
      await screen.findByTestId("jev-create-palette-skeleton"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Summarize" }),
    ).toBeInTheDocument();

    expect(await getRequestBody("path:/api/jev/create/intent")).toEqual({
      text: "orders in texas by month",
    });
    expect(await getRequestBody("path:/api/jev/create/question")).toEqual({
      text: "orders in texas by month",
      table_id: ORDERS_ID,
      table_name: "Orders",
      columns: COLUMNS,
    });
    await waitFor(async () =>
      expect(await getPlanRequestBodies()).toEqual(
        expect.arrayContaining(
          ["dashboard", "document"].map((kind) => ({
            text: "orders in texas by month",
            table_ids: [ORDERS_ID, PRODUCTS_ID],
            kind,
          })),
        ),
      ),
    );

    expect(getSelectedChip("Create")).toHaveTextContent("Question");
    expect(getSelectedChip("Table")).toHaveTextContent("Orders");
    expect(getSelectedChip("User → State")).toHaveTextContent("TX");
    expect(getSelectedChip("Summarize")).toHaveTextContent("Count of rows");
    expect(getSelectedChip("Group by")).toHaveTextContent("Created At");
    expect(getSelectedChip("Time grouping")).toHaveTextContent("Month");
    expect(getSelectedChip("Visualization")).toHaveTextContent("Line chart");
    expect(screen.getByTestId("jev-create-latency")).toHaveTextContent(
      "Jev · 240ms",
    );
  });

  it("switches to the dashboard plan without asking Jev again", async () => {
    const { input } = setup();
    await userEvent.type(input, "orders in texas by month");
    await screen.findByRole("option", { name: "Summarize" });

    await userEvent.keyboard("{Tab}");

    expect(getSelectedChip("Create")).toHaveTextContent("Dashboard");
    expect(
      await screen.findByRole("option", { name: "Name" }),
    ).toHaveTextContent("Sales overview");
    expect(getSelectedChip("Total orders")).toHaveTextContent("Include");
    expect(getSelectedChip("Revenue by category")).toHaveTextContent("Skip");
    expect(
      screen.queryByRole("option", { name: "Summarize" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/jev/create/intent"),
    ).toHaveLength(1);
  });

  it("opens the planned question in the query builder on Enter", async () => {
    const { input, onClose, getLocation } = setup();
    await userEvent.type(input, "orders in texas by month");
    await screen.findByRole("option", { name: "Summarize" });

    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const location = getLocation();
    expect(location.pathname).toBe("/question");
    const card = deserializeCardFromUrl(location.hash.slice(1));
    expect(card.display).toBe("line");
    expect(card.displayIsLocked).toBe(true);

    const query = Lib.fromJsQuery(SAMPLE_PROVIDER, card.dataset_query);
    const names = (clauses: Lib.Clause[]) =>
      clauses.map((clause) => Lib.displayInfo(query, -1, clause).displayName);
    expect(names(Lib.filters(query, -1))).toEqual(["State is TX"]);
    expect(names(Lib.aggregations(query, -1))).toEqual(["Count"]);
    expect(names(Lib.breakouts(query, -1))).toEqual(["Created At: Month"]);
  });

  it("creates once the plan arrives when Enter is pressed early", async () => {
    const { input, onClose, getLocation } = setup();
    await userEvent.type(input, "orders in texas by month{Enter}");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(getLocation().pathname).toBe("/question");
    expect(
      fetchMock.callHistory.calls("path:/api/jev/create/intent"),
    ).toHaveLength(1);
  });

  it("uses the options the user cycled to", async () => {
    const { input, getLocation } = setup();
    await userEvent.type(input, "orders in texas by month");
    await screen.findByRole("option", { name: "Summarize" });

    // Create, Table, User → State, Summarize
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Tab}");
    expect(getSelectedChip("User → State")).toHaveTextContent("No change");
    await userEvent.keyboard("{ArrowDown}{Tab}");
    expect(getSelectedChip("Summarize")).toHaveTextContent("Sum of Subtotal");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(getLocation().pathname).toBe("/question"));
    const card = deserializeCardFromUrl(getLocation().hash.slice(1));
    const query = Lib.fromJsQuery(SAMPLE_PROVIDER, card.dataset_query);
    expect(Lib.filters(query, -1)).toHaveLength(0);
    expect(
      Lib.aggregations(query, -1).map(
        (clause) => Lib.displayInfo(query, -1, clause).displayName,
      ),
    ).toEqual(["Sum of Subtotal"]);
  });

  it("creates a dashboard with the included questions on Enter", async () => {
    const { input, onClose, getLocation } = setup();
    await userEvent.type(input, "a sales overview dashboard");
    await screen.findByRole("option", { name: "Summarize" });
    await userEvent.keyboard("{Tab}");
    await screen.findByRole("option", { name: "Revenue by category" });

    await userEvent.click(
      within(getRow("Revenue by category")).getByRole("button", {
        name: /Include/,
      }),
    );
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await getRequestBody("path:/api/dashboard")).toEqual({
      name: "Sales overview",
      collection_id: PERSONAL_COLLECTION_ID,
    });
    expect(
      await getRequestBody(`path:/api/dashboard/${NEW_DASHBOARD_ID}`),
    ).toEqual({
      dashcards: [
        { id: -1, card_id: 11, col: 0, row: 0, size_x: 12, size_y: 6 },
        { id: -2, card_id: 12, col: 12, row: 0, size_x: 12, size_y: 6 },
      ],
    });
    expect(getLocation().pathname).toMatch(
      new RegExp(`^/dashboard/${NEW_DASHBOARD_ID}`),
    );
  });

  it("switches to the document plan", async () => {
    const { input } = setup();
    await userEvent.type(input, "orders in texas by month");
    await screen.findByRole("option", { name: "Summarize" });

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

    expect(getSelectedChip("Create")).toHaveTextContent("Document");
    expect(
      await screen.findByRole("option", { name: "Name" }),
    ).toHaveTextContent("Sales write-up");
    expect(getSelectedChip("Revenue by category")).toHaveTextContent("Include");
    expect(
      fetchMock.callHistory.calls("path:/api/jev/create/dashboard"),
    ).toHaveLength(2);
  });

  it("creates a document embedding the included questions on Enter", async () => {
    const { input, onClose, getLocation } = setup({
      intent: {
        ...INTENT,
        kind: {
          choice: "document",
          probabilities: { question: 0, dashboard: 0.02, document: 0.98 },
        },
      },
    });
    await userEvent.type(input, "a write-up of last quarter's sales");
    await screen.findByRole("option", { name: "Total orders" });

    // Create, Name, Revenue by category, Total orders
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Tab}");
    expect(getSelectedChip("Total orders")).toHaveTextContent("Skip");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await getRequestBody("path:/api/document")).toEqual({
      name: "Sales write-up",
      collection_id: PERSONAL_COLLECTION_ID,
      document: {
        type: "doc",
        content: [
          {
            type: "resizeNode",
            content: [
              {
                type: "cardEmbed",
                attrs: { id: 12, _id: expect.any(String) },
              },
            ],
          },
        ],
      },
    });
    expect(fetchMock.callHistory.calls("path:/api/dashboard")).toHaveLength(0);
    expect(getLocation().pathname).toBe(`/document/${NEW_DOCUMENT_ID}`);
  });

  it("doesn't create an empty dashboard", async () => {
    const { input, onClose } = setup({
      intent: {
        ...INTENT,
        kind: {
          choice: "dashboard",
          probabilities: { question: 0.1, dashboard: 0.85, document: 0.05 },
        },
      },
      dashboardPlan: { ...DASHBOARD_PLAN, status: "no-cards", cards: [] },
    });
    await userEvent.type(input, "a sales overview dashboard");

    expect(
      await screen.findByText("No existing questions on these tables"),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock.callHistory.calls("path:/api/dashboard")).toHaveLength(0);
  });

  it("doesn't plan a question when no table fits", async () => {
    const { input } = setup({
      intent: {
        ...INTENT,
        tables: INTENT.tables.map((table) => ({ ...table, probability: 0.01 })),
      },
    });
    await userEvent.type(input, "tell me a joke");

    expect(
      await screen.findByText(
        "No table fits — try naming what you want to see",
      ),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/jev/create/question"),
    ).toHaveLength(0);
  });

  it("closes on Escape", async () => {
    const { input, onClose } = setup();
    await userEvent.type(input, "orders{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
