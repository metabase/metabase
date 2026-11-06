import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { TestQuerySpec } from "metabase-types/api";
import { createMockCard, createMockMeasure } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type {
  SummaryDragItem,
  SummaryField,
  SummaryFieldSection,
} from "./types";
import {
  addField,
  areQueriesEqual,
  canDropOnWell,
  changeValueOperator,
  clearWell,
  dropOnWell,
  filterFieldSections,
  getDimensionItems,
  getFieldSections,
  getValueItems,
  getWellFieldSections,
  replaceWellWithField,
} from "./utils";

const STAGE_INDEX = -1;

function createOrdersQuery(spec: TestQuerySpec = DEFAULT_TEST_QUERY) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, spec);
}

function createProviderWithMetricAndMeasure() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", fieldId: ORDERS.SUBTOTAL }],
            },
          ],
        },
      ],
    }),
  });
  const measure = createMockMeasure({
    id: 1,
    name: "Order count",
    table_id: ORDERS_ID,
    definition: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count" }],
        },
      ],
    }),
  });
  return createMetadataProvider({
    metadata: createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [metric],
      measures: [measure],
    }),
  });
}

function createOrdersQueryWithMetricsAndMeasures(
  spec: TestQuerySpec = {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  },
) {
  return Lib.createTestQuery(createProviderWithMetricAndMeasure(), spec);
}

function findField(
  sections: SummaryFieldSection[],
  name: string,
): SummaryField {
  const item = sections
    .flatMap((section) => section.items)
    .find((item) => item.name === name);
  if (item == null) {
    throw new Error(`No field named ${name}`);
  }
  return item.field;
}

// a failed identity assertion on two queries makes jest print their whole structures, which
// never finishes; a boolean keeps the failure readable
function isSameQuery(query: Lib.Query, other: Lib.Query) {
  return Object.is(query, other);
}

function getSectionNames(sections: SummaryFieldSection[]) {
  return sections.map((section) => section.name);
}

function getValueLabels(query: Lib.Query) {
  return getValueItems(query, STAGE_INDEX).map(({ kind, label }) => [
    kind,
    label,
  ]);
}

function getDimensionLabels(query: Lib.Query) {
  return getDimensionItems(query, STAGE_INDEX).map(({ label }) => label);
}

describe("getFieldSections", () => {
  it("lists the source table first, then the tables it links to", () => {
    const sections = getFieldSections(createOrdersQuery(), STAGE_INDEX);

    expect(getSectionNames(sections)).toEqual(["Orders", "Product", "User"]);
  });

  it("lists breakoutable columns with their names and icons", () => {
    const [orders] = getFieldSections(createOrdersQuery(), STAGE_INDEX);

    expect(orders.items.map((item) => item.name)).toEqual([
      "Created At",
      "Discount",
      "ID",
      "Product ID",
      "Quantity",
      "Subtotal",
      "Tax",
      "Total",
      "User ID",
    ]);
    expect(orders.items.find((item) => item.name === "ID")?.icon).toBe("label");
    expect(orders.items.find((item) => item.name === "Total")?.icon).toBe(
      "int",
    );
    expect(orders.items.every((item) => item.field.kind === "column")).toBe(
      true,
    );
  });

  it("lists measures, then metrics, before the tables", () => {
    const sections = getFieldSections(
      createOrdersQueryWithMetricsAndMeasures(),
      STAGE_INDEX,
    );

    expect(
      sections.map((section) => [
        section.name,
        section.items.map((item) => [item.name, item.icon, item.field.kind]),
      ]),
    ).toEqual([
      ["Measures", [["Order count", "ruler", "measure"]]],
      ["Metrics", [["Revenue", "metric", "metric"]]],
      ["Orders", expect.any(Array)],
      ["Product", expect.any(Array)],
      ["User", expect.any(Array)],
    ]);
  });

  it("gives every section and item a distinct key", () => {
    const sections = getFieldSections(
      createOrdersQueryWithMetricsAndMeasures(),
      STAGE_INDEX,
    );
    const sectionKeys = sections.map((section) => section.key);
    const itemKeys = sections.flatMap((section) =>
      section.items.map((item) => `${section.key}/${item.key}`),
    );

    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
    expect(new Set(itemKeys).size).toBe(itemKeys.length);
  });

  it("lists an explicitly joined table by its join, in place of the link to it", () => {
    const query = createOrdersQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              strategy: "left-join",
            },
          ],
        },
      ],
    });

    expect(getSectionNames(getFieldSections(query, STAGE_INDEX))).toEqual([
      "Orders",
      "Products",
      "User",
    ]);
  });
});

describe("getWellFieldSections", () => {
  const sections = getFieldSections(
    createOrdersQueryWithMetricsAndMeasures(),
    STAGE_INDEX,
  );

  it("offers Count of rows, measures and metrics, then the columns, to Summarize by", () => {
    const wellSections = getWellFieldSections(sections, "values");

    expect(
      wellSections.map((section) => [
        section.name,
        section.items.map((item) => item.name),
      ]),
    ).toEqual([
      ["Basic", ["Count of rows"]],
      ["Measures", ["Order count"]],
      ["Metrics", ["Revenue"]],
      ["Orders", expect.any(Array)],
      ["Product", expect.any(Array)],
      ["User", expect.any(Array)],
    ]);
  });

  it("offers the table columns to Group by", () => {
    expect(getSectionNames(getWellFieldSections(sections, "columns"))).toEqual([
      "Orders",
      "Product",
      "User",
    ]);
  });
});

describe("filterFieldSections", () => {
  const sections = getFieldSections(
    createOrdersQueryWithMetricsAndMeasures(),
    STAGE_INDEX,
  );

  it("returns the sections as they are for an empty search", () => {
    expect(filterFieldSections(sections, "")).toBe(sections);
    expect(filterFieldSections(sections, "   ")).toBe(sections);
  });

  it("keeps only the items whose names contain the search text, ignoring case", () => {
    const matches = filterFieldSections(sections, "  tOTal ");

    expect(
      matches.map((section) => [
        section.name,
        section.items.map((item) => item.name),
      ]),
    ).toEqual([["Orders", ["Subtotal", "Total"]]]);
  });

  it("matches measures and metrics too", () => {
    expect(getSectionNames(filterFieldSections(sections, "e"))).toEqual([
      "Measures",
      "Metrics",
      "Orders",
      "Product",
      "User",
    ]);
  });

  it("returns no sections when nothing matches", () => {
    expect(filterFieldSections(sections, "nothing like this")).toEqual([]);
  });
});

describe("getValueItems", () => {
  it("tells a count, a column aggregation, a metric, a measure and a custom expression apart", () => {
    const query = createOrdersQueryWithMetricsAndMeasures({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            { type: "operator", operator: "count" },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
            { type: "metric", id: 1 },
            { type: "measure", id: 1 },
            {
              type: "operator",
              operator: "*",
              args: [
                {
                  type: "operator",
                  operator: "sum",
                  args: [{ type: "column", name: "TOTAL" }],
                },
                { type: "literal", value: 2 },
              ],
            },
          ],
        },
      ],
    });

    expect(getValueLabels(query)).toEqual([
      ["count", "Count"],
      ["column", "Sum of Total"],
      ["metric", "Revenue"],
      ["measure", "Order count"],
      ["expression", "Sum of Total × 2"],
    ]);
  });
});

describe("chip keys", () => {
  it("are distinct for clauses whose labels and names repeat", () => {
    const query = createOrdersQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            { name: "Total", value: { type: "column", name: "SUBTOTAL" } },
          ],
          aggregations: [
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
            { type: "operator", operator: "count" },
          ],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "year" },
            { type: "column", name: "TOTAL" },
            { type: "column", name: "Total" },
            { type: "column", name: "CREATED_AT", unit: "month" },
          ],
        },
      ],
    });

    const valueKeys = getValueItems(query, STAGE_INDEX).map(({ key }) => key);
    const dimensionKeys = getDimensionItems(query, STAGE_INDEX).map(
      ({ key }) => key,
    );

    expect(valueKeys).toEqual(["sum", "sum_2", "count"]);
    expect(dimensionKeys).toEqual([
      "CREATED_AT",
      "TOTAL",
      "Total_2",
      "CREATED_AT_2",
    ]);
    expect(getDimensionLabels(query)).toEqual([
      "Created At: Year",
      "Total",
      "Total",
      "Created At: Month",
    ]);
  });
});

describe("getDimensionItems", () => {
  it("names breakouts with their bucket", () => {
    const query = createOrdersQuery({
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count" }],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "month" },
            {
              type: "column",
              sourceFieldId: ORDERS.PRODUCT_ID,
              name: "CATEGORY",
            },
          ],
        },
      ],
    });

    expect(getDimensionLabels(query)).toEqual([
      "Created At: Month",
      "Product → Category",
    ]);
  });
});

describe("addField", () => {
  const query = createOrdersQueryWithMetricsAndMeasures();
  const sections = getFieldSections(query, STAGE_INDEX);

  it("groups by a column with its default bucket, once", () => {
    const createdAt = findField(sections, "Created At");
    const grouped = addField(query, STAGE_INDEX, "columns", createdAt);

    expect(getDimensionLabels(grouped)).toEqual(["Created At: Month"]);
    expect(
      isSameQuery(
        addField(grouped, STAGE_INDEX, "columns", createdAt),
        grouped,
      ),
    ).toBe(true);
  });

  it("sums a number dropped on Summarize by, and counts the distinct values of a text", () => {
    const total = findField(sections, "Total");
    const category = findField(sections, "Category");
    const summed = addField(query, STAGE_INDEX, "values", total);
    const counted = addField(summed, STAGE_INDEX, "values", category);

    expect(getValueLabels(counted)).toEqual([
      ["column", "Sum of Total"],
      ["column", "Distinct values of Category"],
    ]);
  });

  it("adds Count of rows, a metric and a measure once each", () => {
    const count: SummaryField = { kind: "count" };
    const revenue = findField(sections, "Revenue");
    const orderCount = findField(sections, "Order count");
    const withAll = [count, revenue, orderCount].reduce(
      (query, field) => addField(query, STAGE_INDEX, "values", field),
      query,
    );

    expect(getValueLabels(withAll)).toEqual([
      ["count", "Count"],
      ["metric", "Revenue"],
      ["measure", "Order count"],
    ]);
    expect(
      isSameQuery(addField(withAll, STAGE_INDEX, "values", count), withAll),
    ).toBe(true);
    expect(
      isSameQuery(addField(withAll, STAGE_INDEX, "values", revenue), withAll),
    ).toBe(true);
    expect(
      isSameQuery(
        addField(withAll, STAGE_INDEX, "values", orderCount),
        withAll,
      ),
    ).toBe(true);
  });

  it("leaves a metric out of Group by", () => {
    expect(
      isSameQuery(
        addField(query, STAGE_INDEX, "columns", findField(sections, "Revenue")),
        query,
      ),
    ).toBe(true);
  });
});

describe("areQueriesEqual", () => {
  const query = createOrdersQuery({
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
      },
    ],
  });
  const sections = getFieldSections(query, STAGE_INDEX);

  it("ignores clause ids", () => {
    const rebuilt = replaceWellWithField(
      query,
      STAGE_INDEX,
      "columns",
      findField(sections, "Created At"),
    );

    expect(isSameQuery(query, rebuilt)).toBe(false);
    expect(areQueriesEqual(query, rebuilt)).toBe(true);
  });

  it("tells a different grouping apart", () => {
    const regrouped = replaceWellWithField(
      query,
      STAGE_INDEX,
      "columns",
      findField(sections, "Category"),
    );

    expect(areQueriesEqual(query, regrouped)).toBe(false);
  });
});

describe("replaceWellWithField", () => {
  const query = createOrdersQuery({
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          { type: "operator", operator: "count" },
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
        ],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
      },
    ],
  });
  const sections = getFieldSections(query, STAGE_INDEX);

  it("swaps the groupings for the column", () => {
    const next = replaceWellWithField(
      query,
      STAGE_INDEX,
      "columns",
      findField(sections, "Category"),
    );

    expect(getDimensionLabels(next)).toEqual(["Product → Category"]);
    expect(getValueLabels(next)).toHaveLength(2);
  });

  it("keeps a column that's already grouped, dropping the other groupings", () => {
    const next = replaceWellWithField(
      query,
      STAGE_INDEX,
      "columns",
      findField(sections, "Created At"),
    );

    expect(getDimensionLabels(next)).toEqual(["Created At: Month"]);
  });

  it("swaps the values for the field", () => {
    const next = replaceWellWithField(query, STAGE_INDEX, "values", {
      kind: "count",
    });

    expect(getValueLabels(next)).toEqual([["count", "Count"]]);
    expect(getDimensionLabels(next)).toEqual(["Created At: Month"]);
  });

  it("clears a well", () => {
    expect(getValueLabels(clearWell(query, STAGE_INDEX, "values"))).toEqual([]);
    expect(
      getDimensionLabels(clearWell(query, STAGE_INDEX, "columns")),
    ).toEqual([]);
  });
});

describe("drag and drop", () => {
  const query = createOrdersQueryWithMetricsAndMeasures({
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          { type: "operator", operator: "count" },
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
          { type: "metric", id: 1 },
        ],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
      },
    ],
  });
  const sections = getFieldSections(query, STAGE_INDEX);
  const fieldDrag = (name: string): SummaryDragItem => ({
    kind: "field",
    field: findField(sections, name),
    label: name,
  });
  const valueDrag = (label: string): SummaryDragItem => {
    const item = getValueItems(query, STAGE_INDEX).find(
      (item) => item.label === label,
    );
    if (item == null) {
      throw new Error(`No value named ${label}`);
    }
    return { kind: "value", item };
  };
  const dimensionDrag = (): SummaryDragItem => ({
    kind: "dimension",
    item: getDimensionItems(query, STAGE_INDEX)[0],
  });

  it("lets a column field drop on either well, a metric or measure only on Summarize by", () => {
    expect(
      canDropOnWell(query, STAGE_INDEX, fieldDrag("Quantity"), "values"),
    ).toBe(true);
    expect(
      canDropOnWell(query, STAGE_INDEX, fieldDrag("Quantity"), "columns"),
    ).toBe(true);
    expect(
      canDropOnWell(query, STAGE_INDEX, fieldDrag("Order count"), "values"),
    ).toBe(true);
    expect(
      canDropOnWell(query, STAGE_INDEX, fieldDrag("Order count"), "columns"),
    ).toBe(false);
  });

  it("adds a dropped field the way the list would", () => {
    const grouped = dropOnWell(
      query,
      STAGE_INDEX,
      fieldDrag("Quantity"),
      "columns",
    );
    expect(getDimensionLabels(grouped)).toEqual([
      "Created At: Month",
      "Quantity: Auto binned",
    ]);

    const summed = dropOnWell(
      query,
      STAGE_INDEX,
      fieldDrag("Quantity"),
      "values",
    );
    expect(getValueLabels(summed).map(([, label]) => label)).toEqual([
      "Count",
      "Sum of Total",
      "Revenue",
      "Sum of Quantity",
    ]);
  });

  it("moves a column value to Group by and a grouping to Summarize by", () => {
    expect(
      canDropOnWell(query, STAGE_INDEX, valueDrag("Sum of Total"), "columns"),
    ).toBe(true);
    const grouped = dropOnWell(
      query,
      STAGE_INDEX,
      valueDrag("Sum of Total"),
      "columns",
    );
    expect(getValueLabels(grouped).map(([, label]) => label)).toEqual([
      "Count",
      "Revenue",
    ]);
    expect(getDimensionLabels(grouped)).toEqual([
      "Created At: Month",
      "Total: Auto binned",
    ]);

    expect(canDropOnWell(query, STAGE_INDEX, dimensionDrag(), "values")).toBe(
      true,
    );
    const summed = dropOnWell(query, STAGE_INDEX, dimensionDrag(), "values");
    expect(getDimensionLabels(summed)).toEqual([]);
    expect(getValueLabels(summed).map(([, label]) => label)).toEqual([
      "Count",
      "Sum of Total",
      "Revenue",
      "Distinct values of Created At",
    ]);
  });

  it("keeps a chip on its own well and keeps non-column values out of Group by", () => {
    expect(
      canDropOnWell(query, STAGE_INDEX, valueDrag("Sum of Total"), "values"),
    ).toBe(false);
    expect(canDropOnWell(query, STAGE_INDEX, dimensionDrag(), "columns")).toBe(
      false,
    );
    expect(
      canDropOnWell(query, STAGE_INDEX, valueDrag("Count"), "columns"),
    ).toBe(false);
    expect(
      canDropOnWell(query, STAGE_INDEX, valueDrag("Revenue"), "columns"),
    ).toBe(false);
    expect(
      isSameQuery(
        dropOnWell(query, STAGE_INDEX, valueDrag("Count"), "columns"),
        query,
      ),
    ).toBe(true);
    expect(
      isSameQuery(
        dropOnWell(query, STAGE_INDEX, dimensionDrag(), "columns"),
        query,
      ),
    ).toBe(true);
  });
});

describe("changeValueOperator", () => {
  const query = createOrdersQuery({
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          { type: "operator", operator: "count" },
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
        ],
      },
    ],
  });

  it("offers the operators that fit the column, with Sum selected", () => {
    const [, total] = getValueItems(query, STAGE_INDEX);
    if (total.kind !== "column") {
      throw new Error("Expected a column value");
    }
    const options = total.operatorOptions;

    expect(options.map((option) => option.shortName)).toEqual(
      expect.arrayContaining(["sum", "avg", "min", "max", "distinct"]),
    );
    expect(options.map((option) => option.shortName)).not.toContain("count");
    expect(
      options.filter((option) => option.isSelected).map((o) => o.shortName),
    ).toEqual(["sum"]);
  });

  it("replaces the aggregation in place", () => {
    const [, total] = getValueItems(query, STAGE_INDEX);
    if (total.kind !== "column") {
      throw new Error("Expected a column value");
    }
    const average = total.operatorOptions.find(
      (option) => option.shortName === "avg",
    );
    if (average == null) {
      throw new Error("Expected an Average operator");
    }

    const next = changeValueOperator(
      query,
      STAGE_INDEX,
      total,
      average.operator,
    );

    expect(getValueLabels(next)).toEqual([
      ["count", "Count"],
      ["column", "Average of Total"],
    ]);
  });
});
