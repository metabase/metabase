import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen, within } from "__support__/ui";
import { Outlet, Route } from "metabase/router";

import {
  NESTED_SEGMENT_ID,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  TOTAL_MEASURE_ID,
  TOTAL_SEGMENT_ID,
  enterCustomExpression,
  getAggregationFromBody,
  setupEnterpriseMeasureState,
  setupMeasureMetadata,
} from "../../test-utils";

import { PublishedTableNewMeasurePage } from "./PublishedTableNewMeasurePage";

const MEASURE_NAME = "Table Measure";
const CREATED_MEASURE_ID = 99;

const TOTAL = [
  "field",
  { "base-type": "type/Float", "effective-type": "type/Float" },
  ORDERS.TOTAL,
];
const ORDERS_ID_FIELD = [
  "field",
  { "base-type": "type/BigInteger", "effective-type": "type/BigInteger" },
  ORDERS.ID,
];
const PRODUCT_ID_FIELD = [
  "field",
  {
    "base-type": "type/BigInteger",
    "effective-type": "type/BigInteger",
    "source-field": ORDERS.PRODUCT_ID,
  },
  PRODUCTS.ID,
];
const PRODUCT_PRICE_FIELD = [
  "field",
  {
    "base-type": "type/Float",
    "effective-type": "type/Float",
    "source-field": ORDERS.PRODUCT_ID,
  },
  PRODUCTS.PRICE,
];

function named(name: string) {
  return { name, "display-name": name };
}

function setup() {
  setupMeasureMetadata();
  fetchMock.post("path:/api/measure", ({ options }) => {
    const body: unknown = JSON.parse(String(options.body));
    return { ...Object(body), id: CREATED_MEASURE_ID, table_id: ORDERS_ID };
  });

  renderWithProviders(
    <Route element={<Outlet />}>
      <Route
        path="/data-studio/library/tables/:tableId/measures/new"
        element={<PublishedTableNewMeasurePage />}
      />
      <Route
        path="/data-studio/library/tables/:tableId/measures/:measureId"
        element={<div>Measure detail page</div>}
      />
    </Route>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `/data-studio/library/tables/${ORDERS_ID}/measures/new`,
      storeInitialState: setupEnterpriseMeasureState(),
    },
  );
}

async function startNewMeasure() {
  const nameInput = await screen.findByPlaceholderText("New measure");
  // Products, behind the Product ID FK, loads after Orders; a user who picks
  // an implicit join column waits for it.
  await act(() => fetchMock.callHistory.flush(true));
  await userEvent.type(nameInput, MEASURE_NAME);
  await userEvent.click(screen.getByText("Pick an aggregation function"));
}

async function saveMeasure() {
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await within(await screen.findByTestId("undo-list")).findByText(
      "Measure created",
    ),
  ).toBeInTheDocument();
  expect(await screen.findByText("Measure detail page")).toBeInTheDocument();

  const calls = fetchMock.callHistory.calls("path:/api/measure", {
    method: "POST",
  });
  expect(calls).toHaveLength(1);
  const body: unknown = JSON.parse(String(calls[0].options.body));
  expect(body).toMatchObject({
    name: MEASURE_NAME,
    definition: {
      database: SAMPLE_DB_ID,
      stages: [{ "source-table": ORDERS_ID }],
    },
  });
  return getAggregationFromBody(body);
}

describe("PublishedTableNewMeasurePage", () => {
  it("should create a measure with an aggregation without columns", async () => {
    setup();
    await startNewMeasure();
    await userEvent.click(await screen.findByText("Count of rows"));

    expect(await saveMeasure()).toEqual([["count", {}]]);
  });

  it("should create a measure with a column from the main data source", async () => {
    setup();
    await startNewMeasure();
    await userEvent.click(await screen.findByText("Sum of ..."));
    await userEvent.click(await screen.findByText("Total"));

    expect(await saveMeasure()).toEqual([["sum", {}, TOTAL]]);
  });

  it("should create a measure with a column from an implicit join", async () => {
    setup();
    await startNewMeasure();
    await userEvent.click(await screen.findByText("Average of ..."));
    await userEvent.click(await screen.findByText("Product"));
    await userEvent.click(await screen.findByText("Price"));

    expect(await saveMeasure()).toEqual([["avg", {}, PRODUCT_PRICE_FIELD]]);
  });

  it.each([
    {
      title: "a column from the main data source using offset",
      formula: "Offset(Sum([[Total]), -1)",
      name: "Offset Measure",
      expected: ["offset", named("Offset Measure"), ["sum", {}, TOTAL], -1],
    },
    {
      title: "a column from an implicit join using offset",
      // A real browser expands a typed `->` into `→`; jsdom does not.
      formula: "Offset(Average([[Product → Price]), -1)",
      name: "Offset Measure",
      expected: [
        "offset",
        named("Offset Measure"),
        ["avg", {}, PRODUCT_PRICE_FIELD],
        -1,
      ],
    },
    {
      title: "a custom aggregation expression",
      formula:
        "DistinctIf([[Product → ID], [[ID] > 1) + DistinctIf([[ID], [[Product → ID] > 1)",
      name: "Custom",
      expected: [
        "+",
        named("Custom"),
        ["distinct-where", {}, PRODUCT_ID_FIELD, [">", {}, ORDERS_ID_FIELD, 1]],
        ["distinct-where", {}, ORDERS_ID_FIELD, [">", {}, PRODUCT_ID_FIELD, 1]],
      ],
    },
    {
      title: "a segment",
      formula: "CountIf([[TotalSegment])",
      name: "Custom",
      expected: [
        "count-where",
        named("Custom"),
        ["segment", {}, TOTAL_SEGMENT_ID],
      ],
    },
    {
      title: "a nested segment",
      formula: "CountIf([[NestedSegment])",
      name: "Custom",
      expected: [
        "count-where",
        named("Custom"),
        ["segment", {}, NESTED_SEGMENT_ID],
      ],
    },
    {
      title: "another measure with an identity expression",
      formula: "[[TotalMeasure]",
      name: "Custom",
      expected: ["measure", named("Custom"), TOTAL_MEASURE_ID],
    },
    {
      title: "another measure",
      formula: "floor([[TotalMeasure])",
      name: "Custom",
      expected: [
        "floor",
        named("Custom"),
        ["measure", { "display-name": "TotalMeasure" }, TOTAL_MEASURE_ID],
      ],
    },
    {
      title: "a filter like CountIf",
      formula: "CountIf([[Total] > 10)",
      name: "Custom",
      expected: ["count-where", named("Custom"), [">", {}, TOTAL, 10]],
    },
  ])(
    "should create a measure with $title",
    async ({ formula, name, expected }) => {
      setup();
      await startNewMeasure();
      await userEvent.click(await screen.findByText("Custom Expression"));
      await enterCustomExpression({ formula, name, button: "Done" });

      expect(await saveMeasure()).toEqual([expected]);
    },
  );

  it("should not be possible to create a measure that references a metric", async () => {
    setup();
    await startNewMeasure();

    expect(await screen.findByText("Custom Expression")).toBeInTheDocument();
    expect(screen.getByText("Measures")).toBeInTheDocument();
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Custom Expression"));
    const input = await screen.findByTestId("custom-expression-query-editor");
    await userEvent.type(input, "[[OrdersCount]");
    await userEvent.tab();

    expect(
      await screen.findByText(
        "Unknown Aggregation, Measure or Metric: OrdersCount",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });
});
