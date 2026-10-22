import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupListDataAppsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { AUDIT_DB_ID } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/constants";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import type { Database, Dataset, Field } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataApp,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockGroup,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import { DataAppsAnalyticsPage } from "./DataAppsAnalyticsPage";

const QUERY_LOG_TABLE_ID = 3001;

// The ids `buildTable` gives the fields.
const fieldId = (index: number) => QUERY_LOG_TABLE_ID * 100 + index;
const FIELD_IDS = {
  entity_id: fieldId(0),
  started_at: fieldId(1),
  embedding_client: fieldId(2),
  embedding_client_identifier: fieldId(3),
  user_id: fieldId(4),
  action_id: fieldId(5),
};

const BASE_TYPE = {
  text: "type/Text",
  integer: "type/Integer",
  float: "type/Float",
  boolean: "type/Boolean",
  dateTime: "type/DateTimeWithLocalTZ",
} as const;

type FieldSpec = [
  type: keyof typeof BASE_TYPE,
  name: string,
  semantic_type: Field["semantic_type"],
];

const QUERY_LOG_FIELDS: FieldSpec[] = [
  ["integer", "entity_id", "type/PK"],
  ["dateTime", "started_at", "type/CreationTimestamp"],
  ["text", "embedding_client", "type/Category"],
  ["text", "embedding_client_identifier", "type/Category"],
  ["integer", "user_id", "type/FK"],
  ["integer", "action_id", null],
  ["float", "running_time_seconds", null],
  ["integer", "result_rows", "type/Quantity"],
  ["text", "error", null],
  ["text", "sanitized_user_agent", null],
  ["text", "user_agent", null],
  ["text", "metabase_version", null],
  ["text", "card_qualified_id", "type/FK"],
  ["text", "database_qualified_id", "type/FK"],
  ["text", "action_qualified_id", "type/FK"],
  ["text", "query", "type/SerializedJSON"],
];

const buildTable = (id: number, name: string, fields: FieldSpec[]) =>
  createMockTable({
    id,
    db_id: AUDIT_DB_ID,
    schema: "public",
    name,
    display_name: name,
    fields: fields.map(([type, fieldName, semantic_type], i) =>
      createMockField({
        id: id * 100 + i,
        table_id: id,
        name: fieldName,
        display_name: fieldName,
        fingerprint: null,
        base_type: BASE_TYPE[type],
        effective_type: BASE_TYPE[type],
        semantic_type,
      }),
    ),
  });

const buildAuditDatabase = (fields: FieldSpec[]): Database =>
  createMockDatabase({
    id: AUDIT_DB_ID,
    name: "Audit DB",
    tables: [buildTable(QUERY_LOG_TABLE_ID, "v_query_log", fields)],
  });

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
const SANITIZED_USER_AGENT = "Browser (Chrome/OS X)";
const QUERY = '{"lib/type":"mbql/query","stages":[{"source-card":306}]}';

// The first row reads a question, the second runs an action.
const logDataset: Dataset = createMockDataset({
  data: createMockDatasetData({
    cols: [
      "started_at",
      "embedding_client_identifier",
      "action_id",
      "sanitized_user_agent",
      "user_agent",
      "metabase_version",
    ]
      .map((name) => createMockColumn({ name, display_name: name }))
      .concat([
        // The query processor returns a remapped id alongside the column holding its name.
        createMockColumn({ name: "user_id", remapped_to: "full_name" }),
        createMockColumn({ name: "full_name", remapped_from: "user_id" }),
        createMockColumn({ name: "card_qualified_id", remapped_to: "name" }),
        createMockColumn({ name: "name", remapped_from: "card_qualified_id" }),
        createMockColumn({ name: "query" }),
      ]),
    rows: [
      [
        "2026-10-01T10:00:00Z",
        "product-reviews",
        null,
        SANITIZED_USER_AGENT,
        USER_AGENT,
        "v1.0.5-SNAPSHOT",
        1,
        "Ada Lovelace",
        "card_306",
        "Product reviews",
        QUERY,
      ],
      [
        "2026-10-01T09:00:00Z",
        "unknown-app",
        5,
        null,
        null,
        "v1.0.5-SNAPSHOT",
        2,
        "Grace Hopper",
        null,
        null,
        null,
      ],
    ],
  }),
  database_id: AUDIT_DB_ID,
  row_count: 2,
  running_time: 1,
});

/** At most `total` of the log's records, so the rows agree with the count. */
const createLogDataset = (total: number): Dataset => {
  const rows = logDataset.data.rows.slice(0, total);
  return {
    ...logDataset,
    data: { ...logDataset.data, rows },
    row_count: rows.length,
  };
};

const createCountDataset = (total: number): Dataset =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [createMockColumn({ name: "count", display_name: "Count" })],
      rows: [[total]],
    }),
    database_id: AUDIT_DB_ID,
    row_count: 1,
    running_time: 1,
  });

// The dropdown's distinct apps: one still installed, one removed since.
const loggedDataAppsDataset: Dataset = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockColumn({ name: "embedding_client_identifier" })],
    rows: [["product-reviews"], ["store-desk"]],
  }),
  database_id: AUDIT_DB_ID,
  row_count: 2,
  running_time: 1,
});

type DatasetStage = Record<string | number | symbol, unknown>;

function getFirstStage(body: unknown): DatasetStage | undefined {
  if (typeof body !== "string") {
    return undefined;
  }
  const query: unknown = JSON.parse(body);
  if (!isObject(query) || !Array.isArray(query.stages)) {
    return undefined;
  }
  const stages: unknown[] = query.stages;
  const [stage] = stages;
  return isObject(stage) ? stage : undefined;
}

const isLoggedDataAppsStage = (stage: DatasetStage | undefined) =>
  stage?.breakout !== undefined && stage.aggregation === undefined;

const isCountStage = (stage: DatasetStage | undefined) =>
  stage?.aggregation !== undefined && stage.breakout === undefined;

const createFailure = (message: string) => ({
  status: 500,
  body: { message },
});

type SetupOpts = {
  fields?: FieldSpec[];
  /** The number of records the count query reports. */
  total?: number;
  failingRequest?: "metadata" | "count" | "rows";
  initialRoute?: string;
  hasPii?: boolean;
};

function setup({
  fields = QUERY_LOG_FIELDS,
  total = 2,
  failingRequest,
  initialRoute = Urls.monitorAiAuditingDataApps(),
  hasPii = false,
}: SetupOpts = {}) {
  // TreeTable measures its rows via the DOM; jsdom needs a stubbed rect to render them.
  mockGetBoundingClientRect({ width: 100, height: 100 });
  setupEnterprisePlugins();
  const auditDatabase = buildAuditDatabase(fields);
  fetchMock.get(
    `path:/api/database/${AUDIT_DB_ID}/metadata`,
    failingRequest === "metadata"
      ? createFailure("Metadata failed")
      : auditDatabase,
  );
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [auditDatabase],
    tables: auditDatabase.tables ?? [],
    fields: (auditDatabase.tables ?? []).flatMap((table) => table.fields ?? []),
  });
  fetchMock.post(
    "path:/api/dataset",
    (callLog) => {
      const stage = getFirstStage(callLog.options.body);
      if (isLoggedDataAppsStage(stage)) {
        return loggedDataAppsDataset;
      }
      if (isCountStage(stage)) {
        return failingRequest === "count"
          ? createFailure("Count failed")
          : createCountDataset(total);
      }
      return failingRequest === "rows"
        ? createFailure("Rows failed")
        : createLogDataset(total);
    },
    { name: "dataset" },
  );
  setupUsersEndpoints([
    createMockUser({ id: 1, first_name: "Ada", last_name: "Lovelace" }),
  ]);
  setupGroupsEndpoint([createMockGroup({ id: 1, name: "All Users" })]);
  setupListDataAppsEndpoint([
    createMockDataApp({
      id: 1,
      name: "product-reviews",
      display_name: "Reviews",
    }),
    createMockDataApp({
      id: 2,
      name: "store-archive",
      display_name: "Archive",
      enabled: false,
    }),
  ]);

  return renderWithProviders(
    <Route
      path={Urls.monitorAiAuditingDataApps()}
      element={<DataAppsAnalyticsPage />}
    />,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            audit_app: true,
            "data-apps": true,
          }),
          "analytics-pii-retention-enabled": hasPii,
        }),
      }),
    },
  );
}

function getDatasetStages(): DatasetStage[] {
  return fetchMock.callHistory
    .calls("dataset")
    .map((call) => getFirstStage(call.options?.body))
    .filter((stage): stage is DatasetStage => stage !== undefined);
}

/** A stage's MBQL 5 clauses under `key`, each `[operator, options, ...args]`. */
function getClauses(
  stage: DatasetStage,
  key: "filters" | "order-by",
): unknown[][] {
  const clauses = stage[key];
  if (!Array.isArray(clauses)) {
    return [];
  }
  const items: unknown[] = clauses;
  return items.filter((clause): clause is unknown[] => Array.isArray(clause));
}

/** The field id a `["field", options, id]` reference points at. */
function getFieldRefId(fieldRef: unknown): unknown {
  if (!Array.isArray(fieldRef)) {
    return undefined;
  }
  const parts: unknown[] = fieldRef;
  return parts[2];
}

/**
 * The values a stage's equality filter on `fieldId` matches, or `undefined` without one.
 * MBQL writes a single value as `=` and several as `in`.
 */
function getEqualsFilterValues(stage: DatasetStage, fieldId: number) {
  const clause = getClauses(stage, "filters").find(
    ([operator, , fieldRef]) =>
      (operator === "=" || operator === "in") &&
      getFieldRefId(fieldRef) === fieldId,
  );
  return clause?.slice(3);
}

function getFilterOperator(stage: DatasetStage, fieldId: number) {
  return getClauses(stage, "filters").find(
    ([, , fieldRef]) => getFieldRefId(fieldRef) === fieldId,
  )?.[0];
}

const getRowsStages = () =>
  getDatasetStages().filter((stage) => stage.page !== undefined);

const getHeaders = (table: HTMLElement) =>
  within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);

describe("DataAppsAnalyticsPage", () => {
  it("shows the data app, entity type, user, and date filters, but no group filter or tabs", async () => {
    setup();

    await screen.findByRole("heading", { name: "Data app analytics" });
    expect(screen.getByTestId("data-app-filter-select")).toHaveValue(
      "All data apps",
    );
    expect(screen.getByTestId("entity-type-filter-select")).toHaveValue(
      "All entity types",
    );
    expect(screen.getByTestId("conversation-filters-user-select")).toHaveValue(
      "All users",
    );
    expect(
      screen.getByTestId("conversation-filters-date-select"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("conversation-filters-group-select"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("offers to query the query log's data app records in the notebook", async () => {
    setup();

    const link = await screen.findByRole("link", { name: /Query this data/ });
    const href = link.getAttribute("href") ?? "";
    const [, serializedCard = ""] = href.split("#");
    const stage = getFirstStage(
      JSON.stringify(deserializeCardFromUrl(serializedCard).dataset_query),
    );
    expect(href).toContain("/question/notebook#");
    expect(stage?.["source-table"]).toBe(QUERY_LOG_TABLE_ID);
    expect(getClauses(stage ?? {}, "filters")).toHaveLength(1);
    expect(
      getEqualsFilterValues(stage ?? {}, FIELD_IDS.embedding_client),
    ).toEqual(["data-app"]);
  });

  it("doesn't load the group and tenant options it has no filter for", async () => {
    setup();

    await screen.findByRole("treegrid", { name: "Data app activity" });
    expect(fetchMock.callHistory.called("path:/api/permissions/group")).toBe(
      false,
    );
  });

  it("groups the columns by meaning: when, which app, who ran what, how it went, then the details", async () => {
    setup({ hasPii: true });

    const table = await screen.findByRole("treegrid", {
      name: "Data app activity",
    });
    expect(getHeaders(table)).toEqual([
      "Started at",
      "Identifier",
      "Name",
      "User",
      "Entity type",
      "Question",
      "Action",
      "Running time (s)",
      "Result rows",
      "Database",
      "Query",
      "Metabase version",
      "User agent",
      "Sanitized user agent",
      "IP address",
      "Error",
    ]);
  });

  it("shows each record's entity type, data app, and user", async () => {
    setup();

    const table = await screen.findByRole("treegrid", {
      name: "Data app activity",
    });
    const [questionRow, actionRow] =
      await within(table).findAllByTestId("data-app-log-row");
    expect(within(questionRow).getByText("Question")).toBeInTheDocument();
    expect(within(questionRow).getByText("Reviews")).toBeInTheDocument();
    expect(
      within(questionRow).getByText("product-reviews"),
    ).toBeInTheDocument();
    expect(within(questionRow).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(actionRow).getByText("Action")).toBeInTheDocument();
    // Not in the user list the filter loads: the log names the user itself.
    expect(within(actionRow).getByText("Grace Hopper")).toBeInTheDocument();
    // An app that's no longer installed has no name, only its identifier.
    expect(within(actionRow).getByText("unknown-app")).toBeInTheDocument();
    expect(within(actionRow).queryByText("Reviews")).not.toBeInTheDocument();
  });

  it("shows the referenced content by name, and the query itself", async () => {
    setup();

    const table = await screen.findByRole("treegrid", {
      name: "Data app activity",
    });
    const [row] = await within(table).findAllByTestId("data-app-log-row");
    expect(within(row).getByText("Product reviews")).toBeInTheDocument();
    expect(within(row).queryByText("card_306")).not.toBeInTheDocument();
    expect(within(row).getByText(QUERY)).toBeInTheDocument();
    expect(within(row).getByText("v1.0.5-SNAPSHOT")).toBeInTheDocument();
  });

  it("shows each record's user agents while PII retention is on", async () => {
    setup({ hasPii: true });

    const table = await screen.findByRole("treegrid", {
      name: "Data app activity",
    });
    const [row] = await within(table).findAllByTestId("data-app-log-row");
    expect(within(row).getByText(SANITIZED_USER_AGENT)).toBeInTheDocument();
    expect(within(row).getByText(USER_AGENT)).toBeInTheDocument();
  });

  it("hides the user agents and IP address, which aren't recorded, while PII retention is off", async () => {
    setup({ hasPii: false });

    const table = await screen.findByRole("treegrid", {
      name: "Data app activity",
    });
    await within(table).findAllByTestId("data-app-log-row");
    ["User agent", "Sanitized user agent", "IP address"].forEach((name) => {
      expect(
        within(table).queryByRole("columnheader", { name }),
      ).not.toBeInTheDocument();
    });
  });

  it("only queries the query log's published data-app records, leaving out previews", async () => {
    setup();

    await screen.findByRole("treegrid", { name: "Data app activity" });
    await waitFor(() => {
      expect(getRowsStages()).not.toHaveLength(0);
    });

    const stages = getDatasetStages();
    expect(stages.some((stage) => stage.aggregation !== undefined)).toBe(true);
    stages.forEach((stage) => {
      expect(stage["source-table"]).toBe(QUERY_LOG_TABLE_ID);
      expect(getEqualsFilterValues(stage, FIELD_IDS.embedding_client)).toEqual([
        "data-app",
      ]);
      expect(getFilterOperator(stage, FIELD_IDS.action_id)).toBeUndefined();
    });
  });

  it("shows an error, and queries nothing, when the query log has no column to scope it to data apps", async () => {
    setup({
      fields: QUERY_LOG_FIELDS.filter(
        ([, name]) => name !== "embedding_client",
      ),
    });

    expect(
      await screen.findByText(
        "The query log is missing the columns this page filters on: embedding_client.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called("dataset")).toBe(false);
    expect(
      screen.queryByRole("link", { name: /Query this data/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { label: "Action", type: "action", operator: "not-null" },
    { label: "Question", type: "question", operator: "is-null" },
  ])("scopes the log to $label records", async ({ label, type, operator }) => {
    const { router } = setup();

    await screen.findByRole("treegrid", { name: "Data app activity" });
    await userEvent.click(screen.getByTestId("entity-type-filter-select"));
    await userEvent.click(await screen.findByRole("option", { name: label }));

    await waitFor(() => {
      const scopedStages = getDatasetStages().filter(
        (stage) => getFilterOperator(stage, FIELD_IDS.action_id) !== undefined,
      );
      // Both the count and the rows are scoped, so the total and the pages agree.
      expect(
        scopedStages.map((stage) => [
          stage.page !== undefined,
          getFilterOperator(stage, FIELD_IDS.action_id),
        ]),
      ).toEqual(
        expect.arrayContaining([
          [false, operator],
          [true, operator],
        ]),
      );
    });
    await waitFor(() => {
      expect(router?.location.search).toContain(`type=${type}`);
    });
  });

  it("offers the installed apps, disabled ones included, and the removed apps with activity in the date range by their identifier, in sections of their own", async () => {
    setup();

    await screen.findByRole("treegrid", { name: "Data app activity" });
    await userEvent.click(screen.getByTestId("data-app-filter-select"));
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["All data apps", "Reviews", "Archive", "store-desk"]);
    const getSectionOptions = (name: string) =>
      within(screen.getByRole("group", { name }))
        .getAllByRole("option")
        .map((option) => option.textContent);
    expect(getSectionOptions("Installed")).toEqual(["Reviews", "Archive"]);
    expect(getSectionOptions("Removed")).toEqual(["store-desk"]);

    await userEvent.click(screen.getByRole("option", { name: "store-desk" }));
    await waitFor(() => {
      const scopedStage = getRowsStages().find(
        (stage) =>
          getEqualsFilterValues(
            stage,
            FIELD_IDS.embedding_client_identifier,
          ) !== undefined,
      );
      expect(
        getEqualsFilterValues(
          scopedStage ?? {},
          FIELD_IDS.embedding_client_identifier,
        ),
      ).toEqual(["store-desk"]);
    });
  });

  it("scopes the log to the selected data app and user", async () => {
    const { router } = setup();

    await screen.findByRole("treegrid", { name: "Data app activity" });

    await userEvent.click(screen.getByTestId("data-app-filter-select"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Reviews" }),
    );
    await userEvent.click(
      screen.getByTestId("conversation-filters-user-select"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Ada Lovelace" }),
    );

    await waitFor(() => {
      const scopedStage = getRowsStages().find(
        (stage) =>
          getEqualsFilterValues(stage, FIELD_IDS.user_id) !== undefined,
      );
      expect(scopedStage).toBeDefined();
      expect(
        getEqualsFilterValues(
          scopedStage ?? {},
          FIELD_IDS.embedding_client_identifier,
        ),
      ).toEqual(["product-reviews"]);
      expect(
        getEqualsFilterValues(scopedStage ?? {}, FIELD_IDS.user_id),
      ).toEqual([1]);
    });
    await waitFor(() => {
      expect(router?.location.search).toContain("app=product-reviews");
    });
  });

  it("orders the log newest first, with the id as a tiebreaker", async () => {
    setup();

    await waitFor(() => {
      const [stage] = getRowsStages();
      expect(stage).toBeDefined();
      expect(
        getClauses(stage ?? {}, "order-by").map(([direction, , fieldRef]) => [
          direction,
          getFieldRefId(fieldRef),
        ]),
      ).toEqual([
        ["desc", FIELD_IDS.started_at],
        ["desc", FIELD_IDS.entity_id],
      ]);
    });
  });

  it("pages through the log, keeping the page in the URL", async () => {
    const { router } = setup({ total: PAGE_SIZE + 1 });

    await userEvent.click(await screen.findByLabelText("Next page"));
    await waitFor(() => {
      expect(getRowsStages().at(-1)?.page).toEqual({
        page: 2,
        items: PAGE_SIZE,
      });
    });
    await waitFor(() => {
      expect(router?.location.search).toContain("page=1");
    });

    await userEvent.click(screen.getByLabelText("Previous page"));
    await waitFor(() => {
      expect(getRowsStages().at(-1)?.page).toEqual({
        page: 1,
        items: PAGE_SIZE,
      });
    });
    await waitFor(() => {
      expect(router?.location.search).not.toContain("page=");
    });
  });

  it("shows an empty list, keeping the filters, when there is no data app activity", async () => {
    setup({ total: 0 });

    const table = await screen.findByTestId("data-app-log-table");
    expect(
      await within(table).findByText("No activity found"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("data-app-filter-select")).toBeInTheDocument();
    expect(screen.getByTestId("entity-type-filter-select")).toBeInTheDocument();
  });

  it("shows the error when counting the records fails", async () => {
    setup({ failingRequest: "count" });

    expect(await screen.findByText("Count failed")).toBeInTheDocument();
    expect(
      screen.queryByRole("treegrid", { name: "Data app activity" }),
    ).not.toBeInTheDocument();
  });

  it("shows the error in the table, keeping the filters, when loading the records fails", async () => {
    setup({ failingRequest: "rows" });

    const table = await screen.findByTestId("data-app-log-table");
    expect(await within(table).findByText("Rows failed")).toBeInTheDocument();
    expect(screen.getByTestId("data-app-filter-select")).toBeInTheDocument();
    expect(screen.queryByLabelText("pagination")).not.toBeInTheDocument();
  });

  it("shows the error, and queries nothing, when the query log's metadata doesn't load", async () => {
    setup({ failingRequest: "metadata" });

    expect(await screen.findByText("Metadata failed")).toBeInTheDocument();
    expect(fetchMock.callHistory.called("dataset")).toBe(false);
  });
});
