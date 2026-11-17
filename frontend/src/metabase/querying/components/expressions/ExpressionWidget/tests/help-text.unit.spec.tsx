jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { screen, waitFor, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  COMMON_DATABASE_FEATURES,
  createMockSegment,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getEditorValue,
  pasteText,
  pressKey,
  queryHelpText,
  setCursorPosition,
  setup,
  typeText,
  waitForHelpTextExample,
  waitForValidationDebounce,
} from "./setup";

describe("ExpressionWidget > help text", () => {
  it("should show the help text of the function being typed", async () => {
    await setup();

    await typeText("lower()");
    await pressKey("ArrowLeft");

    expect(
      await screen.findByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("lower(value)");
    const helpText = screen.getByTestId("expression-helper");
    expect(
      within(helpText).getByText(
        "Returns the string of text in all lower case.",
      ),
    ).toBeInTheDocument();
    expect(
      within(helpText).getByText(
        "The column with values to convert to lower case.",
      ),
    ).toBeInTheDocument();
    // the example is highlighted asynchronously
    await waitFor(() =>
      expect(screen.getByTestId("helptext-example")).not.toBeEmptyDOMElement(),
    );
    await waitForValidationDebounce();
  });

  it("should not show the help text of a function the expression mode does not support", async () => {
    await setup({ expressionMode: "expression" });

    await typeText("Average([Price])");
    await pressKey("ArrowLeft", { times: 2 });
    await waitForValidationDebounce();

    expect(queryHelpText()).not.toBeInTheDocument();
  });

  it("should show the help text of the same function where the expression mode supports it", async () => {
    await setup({ expressionMode: "aggregation" });

    await typeText("Average([Price])");
    await pressKey("ArrowLeft", { times: 2 });

    expect(
      await screen.findByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("Average(column)");
  });
});

describe("ExpressionWidget > help text > multi-line", () => {
  it("should show the help text when typing a multi-line expression (metabase#56152)", async () => {
    await setup({
      query: createPeopleQuery(),
      database: createSampleDatabase({
        features: [...COMMON_DATABASE_FEATURES, "datetime-diff"],
      }),
    });

    await typeText("datetimeDiff()");
    await pressKey("ArrowLeft");
    await waitForHelpTextExample();
    await pressKey("Enter");
    await typeText("  [Created At],");

    expect(
      await screen.findByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("datetimeDiff(datetime1, datetime2, unit)");
    await waitForHelpTextExample();
  });
});

describe("ExpressionWidget > help text > disambiguation (metabase#55300)", () => {
  it("should tell a column from a function without arguments", async () => {
    await setup({ query: createProductsQueryWithExpressions() });

    await pasteText("now() > now");
    await waitForValidationDebounce();

    await pressKey("ArrowLeft");
    await waitForValidationDebounce();
    expect(queryHelpTextHeader()).not.toBeInTheDocument();

    await pressKey("Home");
    expect(await findHelpTextHeader()).toHaveTextContent("now()");
    await waitForHelpTextExample();

    await formatSource();
    await waitFor(() => expect(getEditorValue()).toBe("now() > [now]"));
  });

  it("should tell a column from an aggregation without arguments", async () => {
    await setup({
      query: createProductsQueryWithExpressions(),
      expressionMode: "aggregation",
    });

    await typeText("Count() + Sum(Count)");
    await waitForValidationDebounce();

    await pressKey("ArrowLeft", { times: 2 });
    expect(await findHelpTextHeader()).toHaveTextContent("Sum(column)");
    await waitForHelpTextExample();

    await pressKey("Home");
    expect(await findHelpTextHeader()).toHaveTextContent("Count()");
    await waitForHelpTextExample();

    await formatSource();
    await waitFor(() =>
      expect(getEditorValue()).toBe("Count() + Sum([Count])"),
    );
  });

  it("should tell a segment from a function without arguments", async () => {
    const { query, database } = createOrdersQueryWithSegments();
    await setup({ query, database });

    await typeText("case(now, now(), [Created At])");
    await waitForValidationDebounce();

    await setCursorPosition("case(now, now".length);
    expect(await findHelpTextHeader()).toHaveTextContent("now()");
    await waitForHelpTextExample();

    await setCursorPosition("case(no".length);
    expect(await findHelpTextHeader()).toHaveTextContent("case(");
    await waitForHelpTextExample();

    await formatSource();
    await waitFor(() =>
      expect(getEditorValue()).toBe("case([now], now(), [Created At])"),
    );
  });

  it("should tell a segment from an aggregation without arguments", async () => {
    const { query, database } = createOrdersQueryWithSegments();
    await setup({ query, database, expressionMode: "aggregation" });

    await typeText("Sum(case(Count, Count(), 0))");
    await waitForValidationDebounce();

    await setCursorPosition("Sum(case(Count, Count".length);
    expect(await findHelpTextHeader()).toHaveTextContent("Count()");
    await waitForHelpTextExample();

    await setCursorPosition("Sum(case(Cou".length);
    expect(await findHelpTextHeader()).toHaveTextContent("case(");
    await waitForHelpTextExample();

    await formatSource();
    await waitFor(() =>
      expect(getEditorValue()).toBe("Sum(case([Count], Count(), 0))"),
    );
  });
});

function createPeopleQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: PEOPLE_ID } }],
  });
}

function createProductsQueryWithExpressions() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        fields: [{ type: "column", name: "ID" }],
        expressions: [
          { name: "now", value: { type: "column", name: "CREATED_AT" } },
          {
            name: "Count",
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
}

function createOrdersQueryWithSegments() {
  const definition = Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: "<",
            args: [
              { type: "column", name: "TOTAL" },
              { type: "literal", value: 100 },
            ],
          },
        ],
      },
    ],
  });
  const database = createSampleDatabase({
    tables: [
      createOrdersTable({
        segments: [
          createMockSegment({
            id: 1,
            name: "now",
            table_id: ORDERS_ID,
            definition,
          }),
          createMockSegment({
            id: 2,
            name: "Count",
            table_id: ORDERS_ID,
            definition,
          }),
        ],
      }),
      createPeopleTable(),
      createProductsTable(),
      createReviewsTable(),
    ],
  });
  const provider = createMetadataProvider({
    databaseId: database.id,
    metadata: createMockMetadata({ databases: [database] }),
  });
  const query = Lib.createTestQuery(provider, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
  return { query, database };
}

function queryHelpTextHeader() {
  return screen.queryByTestId("expression-helper-popover-structure");
}

function findHelpTextHeader() {
  return screen.findByTestId("expression-helper-popover-structure");
}

async function formatSource() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Auto-format" }),
  );
}
