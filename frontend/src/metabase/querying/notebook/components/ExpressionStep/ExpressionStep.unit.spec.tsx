import { readFileSync } from "fs";
import { join } from "path";

import userEvent from "@testing-library/user-event";
import Ajv from "ajv";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import { COMMON_DATABASE_FEATURES } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersProductIdField,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";

import { ExpressionStep } from "./ExpressionStep";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// Reached via requireMock because the lint rule forbids importing
// `trackSchemaEvent` outside analytics files.
const { trackSchemaEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

interface SetupOpts {
  query?: Lib.Query;
  database?: Database;
}

function setup({
  query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  database = createSampleDatabase(),
}: SetupOpts = {}) {
  const updateQuery = jest.fn();

  const initialStep = createMockNotebookStep({
    type: "expression",
    query,
  });

  function getRecentQuery(): Lib.Query {
    expect(updateQuery).toHaveBeenCalledWith(expect.anything());
    const [recentQuery] = updateQuery.mock.lastCall;
    return recentQuery;
  }

  setupDatabaseEndpoints(database);

  // Feeds each updated query back into the step, as the notebook does, so a
  // committed expression is part of the query the next popover sees.
  function ExpressionStepWithState() {
    const [step, setStep] = useState(initialStep);
    const handleUpdateQuery = async (query: Lib.Query) => {
      updateQuery(query);
      setStep({ ...step, query });
    };

    return (
      <ExpressionStep
        step={step}
        // @ts-expect-error unit test
        color="#93A1AB"
        stageIndex={step.stageIndex}
        query={step.query}
        updateQuery={handleUpdateQuery}
        isLastOpened={false}
        reportTimezone="UTC"
      />
    );
  }

  renderWithProviders(<ExpressionStepWithState />);

  return { getRecentQuery };
}

interface SetupWithQueryUpdatesOpts {
  query: Lib.Query;
}

function setupWithQueryUpdates({ query }: SetupWithQueryUpdatesOpts) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  setupDatabaseEndpoints(createSampleDatabase());

  function ExpressionStepWithQueryUpdates() {
    const [currentQuery, setCurrentQuery] = useState(query);
    const step = createMockNotebookStep({
      type: "expression",
      query: currentQuery,
    });

    const handleUpdateQuery = async (nextQuery: Lib.Query) => {
      setCurrentQuery(nextQuery);
      onQueryChange(nextQuery);
    };

    return (
      <ExpressionStep
        step={step}
        color="text-disabled"
        stageIndex={step.stageIndex}
        query={step.query}
        updateQuery={handleUpdateQuery}
        isLastOpened={false}
        reportTimezone="UTC"
      />
    );
  }

  renderWithProviders(<ExpressionStepWithQueryUpdates />);

  function getRecentQuery(): Lib.Query {
    expect(onQueryChange).toHaveBeenCalled();
    const [recentQuery] = checkNotNull(onQueryChange.mock.lastCall);
    return recentQuery;
  }

  function getRecentExpressionNames(): string[] {
    const recentQuery = getRecentQuery();
    return Lib.expressions(recentQuery, 0).map(
      (expression) => Lib.displayInfo(recentQuery, 0, expression).displayName,
    );
  }

  return { getRecentQuery, getRecentExpressionNames };
}

async function addExpression({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  await userEvent.click(screen.getByRole("img", { name: "add icon" }));

  const input = await screen.findByTestId("custom-expression-query-editor");
  await userEvent.type(input, formula);
  await act(async () => {
    input.blur();
  });

  await userEvent.type(screen.getByTestId("expression-name"), `${name}{enter}`);
}

function createProductsQueryWithExpressionReferences() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        expressions: [
          { name: "Foo", value: { type: "column", name: "PRICE" } },
          { name: "Bar", value: { type: "column", name: "Foo" } },
          { name: "Quu", value: { type: "column", name: "Bar" } },
        ],
      },
    ],
  });
}

function createProductsQueryWithInExpression() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        expressions: [
          {
            name: "Price plus one",
            value: {
              type: "operator",
              operator: "+",
              args: [
                { type: "column", name: "PRICE" },
                { type: "literal", value: 1 },
              ],
            },
          },
          {
            name: "InColumn",
            value: {
              type: "operator",
              operator: "in",
              args: [
                { type: "literal", value: "Gadget" },
                { type: "column", name: "VENDOR" },
                { type: "column", name: "CATEGORY" },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe("Notebook Editor > Expression Step", () => {
  it("should handle adding expression", async () => {
    const { getRecentQuery } = setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.type(input, "1 + 1");
    await act(async () => {
      input.blur();
    });

    await userEvent.type(
      screen.getByTestId("expression-name"),
      "new expression{enter}",
    );

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "new expression",
    );
  });

  it("should handle updating existing expression", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          expressions: [
            {
              name: "old name",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "literal", value: 1 },
                  { type: "literal", value: 1 },
                ],
              },
            },
          ],
        },
      ],
    });
    const { getRecentQuery } = setup({ query });

    await userEvent.click(screen.getByText("old name"));

    const nameField = screen.getByTestId("expression-name");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "new name{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "new name",
    );
  });

  it("should handle removing existing expression", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          expressions: [
            {
              name: "expression name",
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "literal", value: 1 },
                  { type: "literal", value: 1 },
                ],
              },
            },
          ],
        },
      ],
    });
    const { getRecentQuery } = setup({ query });

    const expressionItem = screen.getByText("expression name");
    const closeIcon = within(expressionItem).getByRole("img", {
      name: "close icon",
    });

    await userEvent.click(closeIcon);

    expect(Lib.expressions(getRecentQuery(), 0)).toHaveLength(0);
  });

  it("should handle expressions named as existing columns (metabase#39508)", async () => {
    const { getRecentQuery } = setup();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.type(input, "1 + 1");
    await act(async () => {
      input.blur();
    });
    await userEvent.type(screen.getByTestId("expression-name"), "Total{enter}");

    const recentQuery = getRecentQuery();
    const expressions = Lib.expressions(recentQuery, 0);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(recentQuery, 0, expressions[0]).displayName).toBe(
      "Total",
    );
  });

  it("should append indexes to duplicate custom expression names (metabase#12104)", async () => {
    const { getRecentExpressionNames } = setupWithQueryUpdates({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
      }),
    });

    await addExpression({ formula: "[[Category]", name: "EXPR" });
    expect(await screen.findByText("EXPR")).toBeInTheDocument();
    expect(getRecentExpressionNames()).toEqual(["EXPR"]);

    await addExpression({ formula: "[[Category]", name: "EXPR" });
    expect(await screen.findByText("EXPR (1)")).toBeInTheDocument();
    expect(getRecentExpressionNames()).toEqual(["EXPR", "EXPR (1)"]);

    await addExpression({ formula: "[[Category]", name: "EXPR" });
    expect(await screen.findByText("EXPR (2)")).toBeInTheDocument();
    expect(screen.getByText("EXPR")).toBeInTheDocument();
    expect(screen.getByText("EXPR (1)")).toBeInTheDocument();
    expect(getRecentExpressionNames()).toEqual([
      "EXPR",
      "EXPR (1)",
      "EXPR (2)",
    ]);
  });

  it.each([
    ["Foo", "[Price]"],
    ["Bar", "[Foo]"],
    ["Quu", "[Bar]"],
  ])(
    "should open the %s expression that references another column with its own formula",
    async (expressionName, expectedFormula) => {
      setup({ query: createProductsQueryWithExpressionReferences() });

      await userEvent.click(screen.getByText(expressionName));

      const editor = await screen.findByTestId(
        "custom-expression-query-editor",
      );
      await waitFor(() => expect(editor).toHaveValue(expectedFormula));
      expect(screen.getByTestId("expression-name")).toHaveValue(expressionName);
    },
  );
  it("should replace an `in` custom column with `notIn` in place, keeping its name", async () => {
    const { getRecentQuery, getRecentExpressionNames } = setupWithQueryUpdates({
      query: createProductsQueryWithInExpression(),
    });

    await userEvent.click(screen.getByText("InColumn"));
    const input = await screen.findByTestId("custom-expression-query-editor");
    await waitFor(() =>
      expect(input).toHaveValue('in("Gadget", [Vendor], [Category])'),
    );
    await userEvent.clear(input);
    await userEvent.type(input, 'notIn("Gadget", [[Vendor], [[Category])');
    await act(async () => {
      input.blur();
    });
    expect(screen.getByTestId("expression-name")).toHaveValue("InColumn");
    const updateButton = screen.getByRole("button", { name: "Update" });
    await waitFor(() => expect(updateButton).toBeEnabled());
    await userEvent.click(updateButton);

    expect(getRecentExpressionNames()).toEqual(["Price plus one", "InColumn"]);
    expect(screen.getByText("Price plus one")).toBeInTheDocument();
    expect(screen.getByText("InColumn")).toBeInTheDocument();

    const recentQuery = getRecentQuery();
    const [otherExpression, inColumnExpression] = Lib.expressions(
      recentQuery,
      0,
    );
    expect(
      Lib.expressionParts(recentQuery, 0, inColumnExpression),
    ).toMatchObject({
      operator: "not-in",
      args: ["Gadget", expect.anything(), expect.anything()],
    });
    expect(Lib.expressionParts(recentQuery, 0, otherExpression)).toMatchObject({
      operator: "+",
      args: [expect.anything(), 1],
    });
  });
});

describe("Notebook Editor > Expression Step > shortcuts", () => {
  // The sample database on H2 supports the regex features that the email and
  // URL extractions need. Product ID is a URL column so it offers the URL
  // extractions.
  const SHORTCUTS_DATABASE = createSampleDatabase({
    features: [...COMMON_DATABASE_FEATURES, "regex/lookaheads-and-lookbehinds"],
    tables: [
      createOrdersTable({
        fields: createOrdersTable().fields?.map((field) =>
          field.id === ORDERS.PRODUCT_ID
            ? createOrdersProductIdField({ semantic_type: "type/URL" })
            : field,
        ),
      }),
      createPeopleTable(),
      createProductsTable(),
      createReviewsTable(),
    ],
  });

  const SHORTCUTS_PROVIDER = createMetadataProvider({
    metadata: createMockMetadata({ databases: [SHORTCUTS_DATABASE] }),
  });

  function createOrdersQuery() {
    return Lib.createTestQuery(SHORTCUTS_PROVIDER, DEFAULT_TEST_QUERY);
  }

  function createAggregatedOrdersQuery() {
    return Lib.createTestQuery(SHORTCUTS_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    });
  }

  beforeEach(() => {
    jest.mocked(trackSchemaEvent).mockClear();
  });

  function setupShortcuts(query = createOrdersQuery()) {
    return setup({ query, database: SHORTCUTS_DATABASE });
  }

  async function openNewExpression() {
    await userEvent.click(screen.getByRole("img", { name: "add icon" }));
  }

  function getEditorValue() {
    return screen.getByTestId<HTMLTextAreaElement>(
      "custom-expression-query-editor",
    ).value;
  }

  /**
   * The column list renders section headers and items as siblings, so find
   * the item that follows the header of its group.
   */
  function getColumnOption(groupName: string, columnName: string) {
    const rows = screen.getAllByTestId(
      /^(list-section-header|dimension-list-item)$/,
    );
    let currentGroup: string | null = null;
    for (const row of rows) {
      if (row.getAttribute("data-testid") === "list-section-header") {
        currentGroup = row.textContent;
      } else if (
        currentGroup === groupName &&
        row.getAttribute("aria-label") === columnName
      ) {
        return row;
      }
    }
    throw new Error(`Could not find ${groupName} → ${columnName}`);
  }

  function expectValidQuestionEvent(event: unknown) {
    // `question` events are sent with schema version 1-0-6, see
    // `metabase/analytics/event.ts`.
    const schema: unknown = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "../../../../../../..",
          "snowplow/iglu-client-embedded/schemas/com.metabase/question/jsonschema/1-0-6",
        ),
        "utf-8",
      ),
    );
    if (typeof schema !== "object" || schema == null) {
      throw new Error("Invalid schema");
    }
    // Iglu schemas use their own meta-schema and keywords.
    const validate = new Ajv({ strict: false, validateSchema: false }).compile(
      schema,
    );
    expect(validate(event)).toBe(true);
  }

  describe("extract columns", () => {
    async function extractColumn(
      groupName: string,
      columnName: string,
      extractionName: string,
    ) {
      await userEvent.click(
        await screen.findByRole("button", { name: /Extract columns/ }),
      );
      await userEvent.click(
        within(getColumnOption(groupName, columnName)).getByText(columnName),
      );
      await userEvent.click(
        within(screen.getByTestId("expression-editor")).getByRole("button", {
          name: new RegExp(`^${extractionName}`),
        }),
      );
    }

    it.each([
      ["User", "Email", "Domain", "domain([User → Email])"],
      ["User", "Email", "Host", "host([User → Email])"],
      ["Orders", "Created At", "Hour of day", "hour([Created At])"],
      ["Orders", "Created At", "Day of month", "day([Created At])"],
      ["Orders", "Created At", "Day of week", "dayName(weekday([Created At]))"],
      [
        "Orders",
        "Created At",
        "Month of year",
        "monthName(month([Created At]))",
      ],
      [
        "Orders",
        "Created At",
        "Quarter of year",
        "quarterName(quarter([Created At]))",
      ],
      ["Orders", "Created At", "Year", "year([Created At])"],
      ["Orders", "Product ID", "Domain", "domain([Product ID])"],
      ["Orders", "Product ID", "Subdomain", "subdomain([Product ID])"],
      ["Orders", "Product ID", "Host", "host([Product ID])"],
    ])(
      "should use the %s → %s %s extraction",
      async (groupName, columnName, extractionName, expression) => {
        setupShortcuts();
        await openNewExpression();
        await extractColumn(groupName, columnName, extractionName);

        expect(getEditorValue()).toBe(expression);
        expect(screen.getByTestId("expression-name")).toHaveValue(
          extractionName,
        );
      },
    );

    it("should suffix the name when the same extraction is added again", async () => {
      const { getRecentQuery } = setupShortcuts();

      await openNewExpression();
      await extractColumn("Orders", "Created At", "Hour of day");
      expect(screen.getByTestId("expression-name")).toHaveValue("Hour of day");
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const firstQuery = getRecentQuery();
      const [firstExpression] = Lib.expressions(firstQuery, 0);
      expect(
        Lib.displayInfo(firstQuery, 0, checkNotNull(firstExpression))
          .displayName,
      ).toBe("Hour of day");

      await openNewExpression();
      await extractColumn("Orders", "Created At", "Hour of day");
      expect(screen.getByTestId("expression-name")).toHaveValue(
        "Hour of day (1)",
      );
    });

    it("should extract from the columns of the stage when it has an aggregation (metabase#43226)", async () => {
      setupShortcuts(createAggregatedOrdersQuery());

      await openNewExpression();
      await extractColumn("Orders", "Created At", "Hour of day");

      expect(getEditorValue()).toBe("hour([Created At])");
      expect(screen.getByTestId("expression-name")).toHaveValue("Hour of day");
    });

    it("should track the extraction", async () => {
      setupShortcuts();

      await openNewExpression();
      await extractColumn("Orders", "Created At", "Hour of day");

      const expectedEvent = {
        event: "column_extract_via_shortcut",
        custom_expressions_used: ["get-hour"],
        database_id: SAMPLE_DB_ID,
        question_id: 0,
      };
      expect(trackSchemaEvent).toHaveBeenCalledTimes(1);
      expect(trackSchemaEvent).toHaveBeenCalledWith("question", expectedEvent);
      expectValidQuestionEvent(expectedEvent);
    });
  });

  describe("combine columns", () => {
    function getColumnRow(label: string) {
      // The label is not linked to its column input, so go up to the row
      // that holds the label, the input and the remove button.
      // eslint-disable-next-line testing-library/no-node-access
      return checkNotNull(screen.getByText(label).parentElement?.parentElement);
    }

    async function selectColumn(
      label: string,
      groupOrColumnName: string,
      columnName?: string,
    ) {
      await userEvent.click(
        within(getColumnRow(label)).getByTestId("column-input"),
      );
      await userEvent.click(await screen.findByText(groupOrColumnName));
      if (columnName) {
        await userEvent.click(await screen.findByText(columnName));
      }
    }

    async function openCombineColumns() {
      await openNewExpression();
      await userEvent.click(
        await screen.findByRole("button", { name: /Combine columns/ }),
      );
    }

    function getExample() {
      return screen.getByTestId("combine-example");
    }

    it("should combine the selected columns with a custom separator", async () => {
      setupShortcuts();
      await openCombineColumns();

      await selectColumn("First column", "Total");
      expect(
        within(getColumnRow("First column")).getByTestId("column-input"),
      ).toHaveTextContent("Total");

      await selectColumn("Second column", "Product", "Rating");
      expect(
        within(getColumnRow("Second column")).getByTestId("column-input"),
      ).toHaveTextContent("Product → Rating");
      expect(getExample()).toHaveTextContent(
        /^123\.45678901234567 123\.45678901234567$/,
      );

      await userEvent.click(
        screen.getByRole("button", { name: /Separated by/ }),
      );
      await userEvent.type(screen.getByLabelText("Separator"), "__");
      expect(getExample()).toHaveTextContent(
        /^123\.45678901234567__123\.45678901234567$/,
      );

      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(getEditorValue()).toBe(
        'concat([Total], "__", [Product → Rating])',
      );
      expect(screen.getByTestId("expression-name")).toHaveValue(
        "Combined Total, Rating",
      );
    });

    it("should go back to an empty editor from the header", async () => {
      setupShortcuts();
      await openCombineColumns();

      await selectColumn("First column", "Total");
      await selectColumn("Second column", "Product", "Rating");
      await userEvent.click(screen.getByText("Select columns to combine"));

      expect(getEditorValue()).toBe("");
      expect(screen.getByTestId("expression-name")).toHaveValue("");
      expect(
        screen.getByRole("button", { name: /Combine columns/ }),
      ).toBeInTheDocument();
    });

    it("should add and remove columns", async () => {
      setupShortcuts();
      await openCombineColumns();

      await selectColumn("First column", "Total");
      await selectColumn("Second column", "Product", "Rating");
      expect(
        screen.queryByRole("button", { name: "Remove column" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Add column/ }));
      await selectColumn("Third column", "User", "Email");
      expect(getExample()).toHaveTextContent(
        /^123\.45678901234567 123\.45678901234567 email@example\.com$/,
      );
      expect(
        screen.getAllByRole("button", { name: "Remove column" }),
      ).toHaveLength(3);

      await userEvent.click(
        within(getColumnRow("Third column")).getByRole("button", {
          name: "Remove column",
        }),
      );
      expect(getExample()).toHaveTextContent(
        /^123\.45678901234567 123\.45678901234567$/,
      );
      expect(
        screen.queryByRole("button", { name: "Remove column" }),
      ).not.toBeInTheDocument();
    });

    it("should remove a column other than the last one", async () => {
      setupShortcuts();
      await openCombineColumns();

      await selectColumn("First column", "Total");
      await selectColumn("Second column", "User", "Email");
      await userEvent.click(screen.getByRole("button", { name: /Add column/ }));
      await selectColumn("Third column", "Product", "Rating");
      expect(getExample()).toHaveTextContent(
        /^123\.45678901234567 email@example\.com 123\.45678901234567$/,
      );

      await userEvent.click(
        within(getColumnRow("Second column")).getByRole("button", {
          name: "Remove column",
        }),
      );
      expect(getExample()).toHaveTextContent(
        /^123\.45678901234567 123\.45678901234567$/,
      );
    });

    it("should combine the columns of the stage when it has an aggregation (metabase#43226)", async () => {
      setupShortcuts(createAggregatedOrdersQuery());
      await openCombineColumns();

      await selectColumn("First column", "User", "Email");
      expect(
        within(getColumnRow("First column")).getByTestId("column-input"),
      ).toHaveTextContent("User → Email");
      expect(
        screen.getByRole("button", { name: "Separated by (empty)" }),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /Separated by/ }),
      );
      expect(screen.getByLabelText("Separator")).toHaveValue("");
    });

    it("should track the combination", async () => {
      setupShortcuts();
      await openCombineColumns();

      await selectColumn("First column", "User", "Email");
      // A text column as the first column defaults to an empty separator.
      expect(
        screen.getByRole("button", { name: "Separated by (empty)" }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: /Separated by/ }),
      );
      expect(screen.getByLabelText("Separator")).toHaveValue("");

      await selectColumn("Second column", "User", "Email");
      expect(trackSchemaEvent).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const expectedEvent = {
        event: "column_combine_via_shortcut",
        custom_expressions_used: ["concat"],
        database_id: SAMPLE_DB_ID,
        question_id: 0,
      };
      expect(trackSchemaEvent).toHaveBeenCalledTimes(1);
      expect(trackSchemaEvent).toHaveBeenCalledWith("question", expectedEvent);
      expectValidQuestionEvent(expectedEvent);
    });
  });

  describe("closing the editor after a shortcut (metabase#63180)", () => {
    // the email extractions need regex lookaheads and lookbehinds, which the
    // H2 sample database supports
    const database = createSampleDatabase({
      features: [
        ...COMMON_DATABASE_FEATURES,
        "regex",
        "regex/lookaheads-and-lookbehinds",
      ],
    });
    const provider = createMetadataProvider({
      databaseId: database.id,
      metadata: createMockMetadata({ databases: [database] }),
    });

    function createQueryWithExpression() {
      return Lib.createTestQuery(provider, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            expressions: [
              {
                name: "Foo",
                value: {
                  type: "operator",
                  operator: "+",
                  args: [
                    { type: "literal", value: 1 },
                    { type: "literal", value: 2 },
                  ],
                },
              },
            ],
          },
        ],
      });
    }

    async function expectClickOutsideToKeepEditor() {
      await userEvent.click(document.body);
      expect(screen.getByTestId("expression-editor")).toBeInTheDocument();
      expect(
        screen.queryByText("Keep editing your custom expression?"),
      ).not.toBeInTheDocument();
    }

    async function expectClickOutsideAfterClearingToCloseEditor() {
      await userEvent.clear(
        screen.getByTestId("custom-expression-query-editor"),
      );
      await userEvent.click(document.body);
      await waitFor(() =>
        expect(
          screen.queryByTestId("expression-editor"),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByText("Keep editing your custom expression?"),
      ).not.toBeInTheDocument();
    }

    it("should keep the editor open after combining columns until the expression is cleared", async () => {
      setup({ query: createQueryWithExpression(), database });

      await userEvent.click(screen.getByRole("img", { name: "add icon" }));
      await userEvent.click(await screen.findByText("Combine columns"));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(
        await screen.findByTestId("custom-expression-query-editor"),
      ).toHaveValue('concat([Created At], " ", [Discount])');

      await expectClickOutsideToKeepEditor();
      await expectClickOutsideAfterClearingToCloseEditor();
    });

    it("should keep the editor open after extracting a column until the expression is cleared", async () => {
      setup({ query: createQueryWithExpression(), database });

      await userEvent.click(screen.getByRole("img", { name: "add icon" }));
      await userEvent.click(await screen.findByText("Extract columns"));
      await userEvent.click(await screen.findByText("User"));
      await userEvent.click(await screen.findByText("Email"));
      await userEvent.click(await screen.findByText("Domain"));
      expect(
        await screen.findByTestId("custom-expression-query-editor"),
      ).toHaveValue("domain([User → Email])");

      await expectClickOutsideToKeepEditor();
      await expectClickOutsideAfterClearingToCloseEditor();
    });
  });
});
