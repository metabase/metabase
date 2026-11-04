import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockMeasure,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { filterFieldSections, getFieldSections } from "./utils";

const STAGE_INDEX = -1;

function createOrdersQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
}

function createOrdersQueryWithMetricsAndMeasures() {
  const metric = createMockCard({
    id: 1,
    name: "Revenue",
    type: "metric",
    table_id: ORDERS_ID,
    dataset_query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
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
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: [metric],
    measures: [measure],
  });
  return Lib.createTestQuery(createMetadataProvider({ metadata }), {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

describe("getFieldSections", () => {
  it("lists the source table first, then the tables it links to", () => {
    const sections = getFieldSections(createOrdersQuery(), STAGE_INDEX);

    expect(sections.map((section) => section.name)).toEqual([
      "Orders",
      "Product",
      "User",
    ]);
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
  });

  it("lists measures, then metrics, before the tables", () => {
    const sections = getFieldSections(
      createOrdersQueryWithMetricsAndMeasures(),
      STAGE_INDEX,
    );

    expect(
      sections.map((section) => [
        section.name,
        section.items.map((item) => [item.name, item.icon]),
      ]),
    ).toEqual([
      ["Measures", [["Order count", "ruler"]]],
      ["Metrics", [["Revenue", "metric"]]],
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
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
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

    const sections = getFieldSections(query, STAGE_INDEX);

    expect(sections.map((section) => section.name)).toEqual([
      "Orders",
      "Products",
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
    const matches = filterFieldSections(sections, "e");

    expect(matches.map((section) => section.name)).toEqual([
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
