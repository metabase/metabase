import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { mockGetBoundingClientRect, screen, within } from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type {
  Card,
  Database,
  Dataset,
  DatasetColumn,
  DatasetQuery,
  RowValue,
  Table,
  UnsavedCard,
} from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleEmailField,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import { setup } from "./test-utils";

registerVisualizations();

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
const { trackSchemaEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

// The URL and email extractions need regex lookaheads and lookbehinds, which
// the H2 sample database supports.
const FEATURES = [
  ...COMMON_DATABASE_FEATURES,
  "regex" as const,
  "regex/lookaheads-and-lookbehinds" as const,
];

/**
 * The sample database with the fields of each table in their position, as the
 * backend lists them. The column pickers keep that order, and the combine
 * shortcut picks its default columns from it.
 */
function createDatabase(tables: Table[]) {
  return createSampleDatabase({
    features: FEATURES,
    tables: tables.map((table) => ({
      ...table,
      fields: table.fields?.map((field, position) => ({ ...field, position })),
    })),
  });
}

const DATABASE = createDatabase([
  createOrdersTable(),
  createPeopleTable(),
  createProductsTable(),
  createReviewsTable(),
]);

// The e2e tests made the Email column a URL column through the field API
const URL_DATABASE = createDatabase([
  createOrdersTable(),
  createPeopleTable({
    fields: checkNotNull(createPeopleTable().fields).map((field) =>
      field.id === PEOPLE.EMAIL
        ? createPeopleEmailField({ semantic_type: "type/URL" })
        : field,
    ),
  }),
  createProductsTable(),
  createReviewsTable(),
]);

const PROVIDER = createMetadataProvider({
  databaseId: DATABASE.id,
  metadata: createMockMetadata({ databases: [DATABASE] }),
});

type SourceRow = Record<string, RowValue>;

const ORDERS_ROW: SourceRow = {
  ID: 1,
  USER_ID: 1,
  PRODUCT_ID: 14,
  SUBTOTAL: 37.65,
  TAX: 2.07,
  TOTAL: 39.72,
  DISCOUNT: null,
  CREATED_AT: "2028-02-11T21:40:27.892",
  QUANTITY: 2,
};

const PEOPLE_ROW: SourceRow = {
  ID: 1,
  ADDRESS: "9611-9809 West Rosedale Road",
  EMAIL: "borer-hudson@yahoo.com",
  PASSWORD: "secret",
  NAME: "Hudson Borer",
  CITY: "Wood River",
  LONGITUDE: -98.5259864,
  STATE: "NE",
  SOURCE: "Twitter",
  BIRTH_DATE: "1986-12-12",
  ZIP: "68883",
  LATITUDE: 40.71314890000001,
  CREATED_AT: "2027-10-07T01:34:35.462",
};

const CREATED_AT = `field:${ORDERS.CREATED_AT}`;
const EMAIL = `field:${PEOPLE.EMAIL}`;
const COMBINED_EMAIL_ID = `concat(${EMAIL}, field:${PEOPLE.ID})`;
const COMBINED_EMAIL_NAME_ID = `concat(${EMAIL}, "__", field:${PEOPLE.NAME}, "+", field:${PEOPLE.ID})`;

/** The value of each expression the tests add, keyed by `getClauseKey`. */
const EXPRESSION_VALUES: Record<string, RowValue> = {
  [`get-hour(${CREATED_AT})`]: 21,
  [`get-day(${CREATED_AT})`]: 11,
  [`day-name(get-day-of-week(${CREATED_AT}))`]: "Friday",
  [`month-name(get-month(${CREATED_AT}))`]: "Feb",
  [`quarter-name(get-quarter(${CREATED_AT}))`]: "Q1",
  [`get-year(${CREATED_AT})`]: 2028,
  [`domain(${EMAIL})`]: "yahoo",
  [`subdomain(${EMAIL})`]: "",
  [`host(${EMAIL})`]: "yahoo.com",
  [`path(${EMAIL})`]: "",
  [`path(field:URL_URL)`]: "/my/path",
  [`concat("http://", domain(${EMAIL}), ".com/my/path")`]:
    "http://yahoo.com/my/path",
  [COMBINED_EMAIL_ID]: "borer-hudson@yahoo.com1",
  [COMBINED_EMAIL_NAME_ID]: "borer-hudson@yahoo.com__Hudson Borer+1",
};

/** An MBQL 5 clause without its options, e.g. `get-hour(field:14)`. */
function getClauseKey(clause: unknown): string {
  if (!Array.isArray(clause)) {
    return JSON.stringify(clause);
  }
  const [operator, , ...args] = clause;
  if (operator === "field") {
    return `field:${args[0]}`;
  }
  return `${operator}(${args.map(getClauseKey).join(", ")})`;
}

function getExpressionName(clause: unknown): string | undefined {
  if (!Array.isArray(clause) || !isObject(clause[1])) {
    return undefined;
  }
  const name = clause[1]["lib/expression-name"];
  return typeof name === "string" ? name : undefined;
}

function getStages(body: unknown): Record<string, unknown>[] {
  const stages = isObject(body) ? body.stages : undefined;
  return Array.isArray(stages) ? stages.filter(isObject) : [];
}

/** The expressions of the last stage, as `name → clause key`. */
function getExpressionKeys(body: unknown): Record<string, string> {
  const expressions = getStages(body).at(-1)?.expressions;
  return Object.fromEntries(
    (Array.isArray(expressions) ? expressions : []).map((clause) => [
      getExpressionName(clause),
      getClauseKey(clause),
    ]),
  );
}

function getRunBodies(): unknown[] {
  return fetchMock.callHistory
    .calls("path:/api/dataset", { method: "POST" })
    .map((call): unknown => JSON.parse(String(call.options.body)));
}

function getLastRunBody(): unknown {
  return getRunBodies().at(-1);
}

function getTableColumns(database: Database, tableId?: unknown) {
  return (database.tables ?? [])
    .filter((table) => tableId === undefined || table.id === tableId)
    .flatMap((table) =>
      (table.fields ?? []).map((field) =>
        createMockColumn({
          ...field,
          id: Number(field.id),
          source: "fields",
          field_ref: ["field", Number(field.id), null],
        }),
      ),
    );
}

interface FakeBackendOpts {
  database: Database;
  cards: Card[];
  row: SourceRow;
}

/**
 * Runs a query the way the backend does, on a single row: the returned
 * columns of the source, then the expressions of the last stage in their
 * order. The request fails for an expression the tests do not know.
 */
function createFakeBackend({ database, cards, row }: FakeBackendOpts) {
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata: createMockMetadata({ databases: [database], questions: cards }),
  });

  return (datasetQuery: DatasetQuery): Dataset => {
    const query = Lib.fromJsQuery(provider, datasetQuery);
    const [firstStage = {}] = getStages(datasetQuery);
    const sourceCard = cards.find(
      (card) => card.id === firstStage["source-card"],
    );
    const sourceColumns = sourceCard
      ? (sourceCard.result_metadata ?? [])
      : getTableColumns(database, firstStage["source-table"]);
    const expressions = new Map(
      Object.entries(getExpressionKeys(datasetQuery)),
    );

    const columns = Lib.returnedColumns(query, -1).map(
      (column): [DatasetColumn, RowValue] => {
        const { name } = Lib.displayInfo(query, -1, column);
        const expressionKey = expressions.get(name);
        if (expressionKey == null) {
          const col = checkNotNull(
            sourceColumns.find((col) => col.name === name),
          );
          return [col, row[name]];
        }
        if (!(expressionKey in EXPRESSION_VALUES)) {
          throw new Error(`Unknown expression ${expressionKey}`);
        }
        const value = EXPRESSION_VALUES[expressionKey];
        const baseType =
          typeof value === "number" ? "type/Integer" : "type/Text";
        const col = createMockColumn({
          id: undefined,
          table_id: undefined,
          name,
          display_name: name,
          base_type: baseType,
          effective_type: baseType,
          source: "fields",
          field_ref: ["expression", name],
        });
        return [col, value];
      },
    );

    return createMockDataset({
      database_id: database.id,
      status: "completed",
      json_query: datasetQuery,
      row_count: 1,
      data: createMockDatasetData({
        cols: columns.map(([col]) => col),
        rows: [columns.map(([, value]) => value)],
      }),
    });
  };
}

interface SetupOpts {
  card: Card | UnsavedCard;
  database?: Database;
  row: SourceRow;
  initialRoute?: string;
}

async function setupShortcuts({
  card,
  database = DATABASE,
  row,
  initialRoute,
}: SetupOpts) {
  const cards = "id" in card ? [card] : [];
  const runQuery = createFakeBackend({ database, cards, row });
  const result = await setup({
    card,
    database,
    dataset: runQuery(card.dataset_query),
    metadata: createMockCardQueryMetadata({ databases: [database], cards }),
    initialRoute,
  });
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) => {
      try {
        // the body is the query that the app serialized with Lib.toJsQuery
        const body: DatasetQuery = JSON.parse(String(call.options.body));
        return runQuery(body);
      } catch (error) {
        return { status: 400, body: { message: String(error) } };
      }
    },
  });
  return result;
}

function createAdhocCard(tableId: number, fieldIds?: number[]) {
  return createMockUnsavedCard({
    display: "table",
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(PROVIDER, {
        stages: [
          {
            source: { type: "table", id: tableId },
            fields: fieldIds?.map((fieldId) => ({
              type: "column" as const,
              name: checkNotNull(
                getTableColumns(DATABASE, tableId).find(
                  (col) => col.id === fieldId,
                ),
              ).name,
            })),
            limit: 1,
          },
        ],
      }),
    ),
  });
}

function getColumnHeaderNames() {
  return (
    within(screen.getByTestId("table-root"))
      .getAllByRole("columnheader")
      .map((header) => header.textContent)
      // the row index column has no name
      .filter((name) => name !== "")
  );
}

/** The text of the cell in the first row, by the name of its column. */
function getCellText(columnName: string) {
  const table = screen.getByTestId("table-root");
  const headers = within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
  const cells = within(table)
    .getAllByRole("gridcell")
    .map((cell) => cell.textContent);
  expect(headers).toContain(columnName);
  expect(cells).toHaveLength(headers.length);
  return cells[headers.indexOf(columnName)];
}

function expectLastEvent(event: string, customExpressionsUsed: string[]) {
  expect(trackSchemaEvent).toHaveBeenLastCalledWith("question", {
    event,
    custom_expressions_used: customExpressionsUsed,
    database_id: SAMPLE_DB_ID,
    question_id: 0,
  });
}

describe("QueryBuilder > column shortcuts", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  afterEach(() => {
    jest.mocked(trackSchemaEvent).mockClear();
  });

  describe("extract via the column header", () => {
    interface ExtractOpts {
      column: string;
      extraction: string;
      option: string;
      example?: string;
      newColumn?: string;
    }

    async function extractFromHeader({
      column,
      extraction,
      option,
      example,
      newColumn = option,
    }: ExtractOpts) {
      const runCount = getRunBodies().length;
      const header = await screen.findByRole("columnheader", { name: column });
      await userEvent.click(within(header).getByText(column));
      await userEvent.click(await screen.findByText(extraction));
      const optionButton = within(screen.getByRole("dialog")).getByRole(
        "button",
        { name: new RegExp(`^${option}`) },
      );
      if (example) {
        expect(optionButton).toHaveTextContent(example);
      }
      await userEvent.click(optionButton);
      expect(
        await screen.findByRole("columnheader", { name: newColumn }),
      ).toBeInTheDocument();
      expect(getRunBodies()).toHaveLength(runCount + 1);
      expect(getColumnHeaderNames().at(-1)).toBe(newColumn);
    }

    interface ExtractCase {
      option: string;
      value: string;
      example: string;
      expression: string;
      functions: string[];
    }

    async function expectExtractionOfEachOption({
      column,
      extraction,
      cases,
    }: {
      column: string;
      extraction: string;
      cases: ExtractCase[];
    }) {
      const expectedExpressions: Record<string, string> = {};
      for (const [index, testCase] of cases.entries()) {
        await extractFromHeader({
          column,
          extraction,
          option: testCase.option,
          example: testCase.example,
        });
        expectedExpressions[testCase.option] = testCase.expression;
        expect(getExpressionKeys(getLastRunBody())).toEqual(
          expectedExpressions,
        );
        expect(getCellText(testCase.option)).toBe(testCase.value);
        expect(trackSchemaEvent).toHaveBeenCalledTimes(index + 1);
        expectLastEvent("column_extract_via_column_header", testCase.functions);
      }
    }

    it("should add a date expression for each option", async () => {
      await setupShortcuts({
        card: createAdhocCard(ORDERS_ID),
        row: ORDERS_ROW,
      });

      await expectExtractionOfEachOption({
        column: "Created At",
        extraction: "Extract day, month…",
        cases: [
          {
            option: "Hour of day",
            value: "21",
            example: "0, 1",
            expression: `get-hour(${CREATED_AT})`,
            functions: ["get-hour"],
          },
          {
            option: "Day of month",
            value: "11",
            example: "1, 2",
            expression: `get-day(${CREATED_AT})`,
            functions: ["get-day"],
          },
          {
            option: "Day of week",
            value: "Friday",
            example: "Monday, Tuesday",
            expression: `day-name(get-day-of-week(${CREATED_AT}))`,
            functions: ["day-name", "get-day-of-week"],
          },
          {
            option: "Month of year",
            value: "Feb",
            example: "Jan, Feb",
            expression: `month-name(get-month(${CREATED_AT}))`,
            functions: ["month-name", "get-month"],
          },
          {
            option: "Quarter of year",
            value: "Q1",
            example: "Q1, Q2",
            expression: `quarter-name(get-quarter(${CREATED_AT}))`,
            functions: ["quarter-name", "get-quarter"],
          },
          {
            option: "Year",
            value: "2,028",
            example: "2026, 2027",
            expression: `get-year(${CREATED_AT})`,
            functions: ["get-year"],
          },
        ],
      });
    });

    it("should handle duplicate expression names", async () => {
      await setupShortcuts({
        card: createAdhocCard(ORDERS_ID),
        row: ORDERS_ROW,
      });

      await extractFromHeader({
        column: "Created At",
        extraction: "Extract day, month…",
        option: "Hour of day",
      });
      await extractFromHeader({
        column: "Created At",
        extraction: "Extract day, month…",
        option: "Hour of day",
        newColumn: "Hour of day_2",
      });

      expect(getExpressionKeys(getLastRunBody())).toEqual({
        "Hour of day": `get-hour(${CREATED_AT})`,
        "Hour of day_2": `get-hour(${CREATED_AT})`,
      });
      expect(getColumnHeaderNames().slice(-2)).toEqual([
        "Hour of day",
        "Hour of day_2",
      ]);
    });

    it("should add a url expression for each option", async () => {
      await setupShortcuts({
        card: createAdhocCard(PEOPLE_ID),
        database: URL_DATABASE,
        row: PEOPLE_ROW,
      });

      await expectExtractionOfEachOption({
        column: "Email",
        extraction: "Extract domain, subdomain…",
        cases: [
          {
            option: "Domain",
            value: "yahoo",
            example: "example, online",
            expression: `domain(${EMAIL})`,
            functions: ["domain"],
          },
          {
            option: "Subdomain",
            value: "",
            example: "www, maps",
            expression: `subdomain(${EMAIL})`,
            functions: ["subdomain"],
          },
          {
            option: "Host",
            value: "yahoo.com",
            example: "example.com, online.com",
            expression: `host(${EMAIL})`,
            functions: ["host"],
          },
        ],
      });
    });

    it("should add an email expression for each option", async () => {
      await setupShortcuts({
        card: createAdhocCard(PEOPLE_ID),
        row: PEOPLE_ROW,
      });

      await expectExtractionOfEachOption({
        column: "Email",
        extraction: "Extract domain, host…",
        cases: [
          {
            option: "Domain",
            value: "yahoo",
            example: "example, online",
            expression: `domain(${EMAIL})`,
            functions: ["domain"],
          },
          {
            option: "Host",
            value: "yahoo.com",
            example: "example.com, online.com",
            expression: `host(${EMAIL})`,
            functions: ["host"],
          },
        ],
      });
    });

    const ORDERS_QUESTION = createMockCard({
      id: 1,
      name: "Orders",
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
    });

    it("should add the new column as the last column of a saved question without viz settings", async () => {
      await setupShortcuts({ card: ORDERS_QUESTION, row: ORDERS_ROW });

      await extractFromHeader({
        column: "Created At",
        extraction: "Extract day, month…",
        option: "Year",
      });

      expect(getLastRunBody()).toMatchObject({
        stages: [{ "source-table": ORDERS_ID }],
      });
      expect(getExpressionKeys(getLastRunBody())).toEqual({
        Year: `get-year(${CREATED_AT})`,
      });
      expect(getCellText("Year")).toBe("2,028");
      expect(trackSchemaEvent).toHaveBeenCalledTimes(1);
      expect(trackSchemaEvent).toHaveBeenCalledWith("question", {
        event: "column_extract_via_column_header",
        custom_expressions_used: ["get-year"],
        database_id: SAMPLE_DB_ID,
        question_id: ORDERS_QUESTION.id,
      });
    });

    // The settings that the e2e test saved: each entry still has the legacy
    // `fieldRef` property that `TableColumnOrderSetting` no longer declares.
    const LEGACY_TABLE_COLUMNS = [
      { name: "ID", fieldRef: ["field", ORDERS.ID, null], enabled: true },
      {
        name: "CREATED_AT",
        fieldRef: ["field", ORDERS.CREATED_AT, { "temporal-unit": "default" }],
        enabled: true,
      },
      {
        name: "QUANTITY",
        fieldRef: ["field", ORDERS.QUANTITY, null],
        enabled: true,
      },
    ];

    it("should add the new column as the last column of a saved question with viz settings", async () => {
      const card = createMockCard({
        ...ORDERS_QUESTION,
        dataset_query: createAdhocCard(ORDERS_ID, [
          ORDERS.ID,
          ORDERS.CREATED_AT,
          ORDERS.QUANTITY,
        ]).dataset_query,
        visualization_settings: { "table.columns": LEGACY_TABLE_COLUMNS },
      });
      await setupShortcuts({ card, row: ORDERS_ROW });
      expect(getColumnHeaderNames()).toEqual(["ID", "Created At", "Quantity"]);

      await extractFromHeader({
        column: "Created At",
        extraction: "Extract day, month…",
        option: "Year",
      });

      expect(getExpressionKeys(getLastRunBody())).toEqual({
        Year: `get-year(${CREATED_AT})`,
      });
      expect(getColumnHeaderNames()).toEqual([
        "ID",
        "Created At",
        "Quantity",
        "Year",
      ]);
    });

    it("should extract the path from a URL column", async () => {
      await setupShortcuts({
        card: createAdhocCard(PEOPLE_ID),
        database: URL_DATABASE,
        row: PEOPLE_ROW,
      });

      await extractFromHeader({
        column: "Email",
        extraction: "Extract domain, subdomain…",
        option: "Path",
        example: "/en/docs/feature",
      });

      expect(getExpressionKeys(getLastRunBody())).toEqual({
        Path: `path(${EMAIL})`,
      });
    });

    it("should extract the path from a model column with the URL semantic type", async () => {
      const urlColumnName = "URL_URL";
      const modelQuery = Lib.createTestQuery(PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PEOPLE_ID },
            limit: 1,
            expressions: [
              {
                name: urlColumnName,
                value: {
                  type: "operator",
                  operator: "concat",
                  args: [
                    { type: "literal", value: "http://" },
                    {
                      type: "operator",
                      operator: "domain",
                      args: [{ type: "column", name: "EMAIL" }],
                    },
                    { type: "literal", value: ".com/my/path" },
                  ],
                },
              },
            ],
          },
        ],
      });
      const runModelQuery = createFakeBackend({
        database: DATABASE,
        cards: [],
        row: PEOPLE_ROW,
      });
      const modelColumns = runModelQuery(Lib.toJsQuery(modelQuery)).data.cols;
      const model = createMockCard({
        id: 2,
        name: "path from url",
        type: "model",
        display: "table",
        dataset_query: Lib.toJsQuery(modelQuery),
        // the model metadata sets the semantic type of the custom column
        result_metadata: modelColumns.map((col) =>
          col.name === urlColumnName
            ? { ...col, semantic_type: "type/URL" }
            : col,
        ),
      });
      await setupShortcuts({
        card: model,
        row: PEOPLE_ROW,
        initialRoute: `/model/${model.id}`,
      });

      await extractFromHeader({
        column: urlColumnName,
        extraction: "Extract domain, subdomain…",
        option: "Path",
        example: "/en/docs/feature",
      });

      expect(getLastRunBody()).toMatchObject({
        stages: [{ "source-card": model.id }],
      });
      expect(getExpressionKeys(getLastRunBody())).toEqual({
        Path: `path(field:${urlColumnName})`,
      });
      expect(getCellText("Path")).toBe("/my/path");
    });
  });

  describe("combine", () => {
    function getColumnRow(label: string) {
      // The label is not linked to its column input, so go up to the row
      // that holds the label, the input and the remove button.
      // eslint-disable-next-line testing-library/no-node-access
      return checkNotNull(screen.getByText(label).parentElement?.parentElement);
    }

    async function selectColumn(label: string, columnName: string) {
      await userEvent.click(
        within(getColumnRow(label)).getByTestId("column-input"),
      );
      const option = await within(getColumnRow(label)).findByLabelText(
        columnName,
      );
      await userEvent.click(within(option).getByText(columnName));
      expect(
        within(getColumnRow(label)).getByTestId("column-input"),
      ).toHaveTextContent(columnName);
    }

    function getExample() {
      return screen.getByTestId("combine-example");
    }

    async function submit(newColumn: string) {
      const runCount = getRunBodies().length;
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Done",
        }),
      );
      expect(
        await screen.findByRole("columnheader", { name: newColumn }),
      ).toBeInTheDocument();
      expect(getRunBodies()).toHaveLength(runCount + 1);
    }

    async function openHeaderCombine(column: string) {
      const header = await screen.findByRole("columnheader", { name: column });
      await userEvent.click(within(header).getByText(column));
      await userEvent.click(await screen.findByText("Combine columns"));
    }

    it("should combine columns from the column header and handle duplicate column names", async () => {
      await setupShortcuts({
        card: createAdhocCard(PEOPLE_ID, [PEOPLE.ID, PEOPLE.EMAIL]),
        row: PEOPLE_ROW,
      });

      await openHeaderCombine("Email");
      expect(getExample()).toHaveTextContent(/^email@example\.com12345$/);
      await submit("Combined Email, ID");

      expect(getExpressionKeys(getLastRunBody())).toEqual({
        "Combined Email, ID": COMBINED_EMAIL_ID,
      });
      expect(getColumnHeaderNames()).toEqual([
        "ID",
        "Email",
        "Combined Email, ID",
      ]);
      expect(getCellText("Combined Email, ID")).toBe("borer-hudson@yahoo.com1");
      expect(trackSchemaEvent).toHaveBeenCalledTimes(1);
      expectLastEvent("column_combine_via_column_header", ["concat"]);

      await openHeaderCombine("Email");
      expect(getExample()).toHaveTextContent("email@example.com12345");
      await selectColumn("Second column", "Name");
      await userEvent.click(
        screen.getByRole("button", { name: "Separated by (empty)" }),
      );
      await userEvent.type(screen.getByLabelText("Separator"), "__");
      expect(getExample()).toHaveTextContent(/^email@example\.com__text$/);

      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: /Add column/,
        }),
      );
      expect(getExample()).toHaveTextContent(
        /^email@example\.com__text__12345$/,
      );

      const separators = screen.getAllByLabelText("Separator");
      expect(separators).toHaveLength(2);
      const lastSeparator = within(getColumnRow("Third column")).getByLabelText(
        "Separator",
      );
      await userEvent.clear(lastSeparator);
      expect(getExample()).toHaveTextContent(/^email@example\.com__text12345$/);
      await userEvent.type(lastSeparator, "+");
      expect(getExample()).toHaveTextContent(
        /^email@example\.com__text\+12345$/,
      );
      await submit("Combined Email, Name, ID");

      expect(getExpressionKeys(getLastRunBody())).toEqual({
        "Combined Email, ID": COMBINED_EMAIL_ID,
        "Combined Email, Name, ID": COMBINED_EMAIL_NAME_ID,
      });
      expect(getColumnHeaderNames()).toEqual([
        "ID",
        "Email",
        "Combined Email, ID",
        "Combined Email, Name, ID",
      ]);
      expect(getCellText("Combined Email, Name, ID")).toBe(
        "borer-hudson@yahoo.com__Hudson Borer+1",
      );
      expect(trackSchemaEvent).toHaveBeenCalledTimes(2);
      expectLastEvent("column_combine_via_column_header", ["concat"]);

      await openHeaderCombine("Email");
      await submit("Combined Email, ID_2");
      await openHeaderCombine("Email");
      await submit("Combined Email, ID_3");

      expect(getExpressionKeys(getLastRunBody())).toEqual({
        "Combined Email, ID": COMBINED_EMAIL_ID,
        "Combined Email, Name, ID": COMBINED_EMAIL_NAME_ID,
        "Combined Email, ID_2": COMBINED_EMAIL_ID,
        "Combined Email, ID_3": COMBINED_EMAIL_ID,
      });
      expect(getColumnHeaderNames()).toEqual([
        "ID",
        "Email",
        "Combined Email, ID",
        "Combined Email, Name, ID",
        "Combined Email, ID_2",
        "Combined Email, ID_3",
      ]);
    });
  });
});
