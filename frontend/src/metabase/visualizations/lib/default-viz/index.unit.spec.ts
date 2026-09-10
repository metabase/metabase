import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { CardDisplayType } from "metabase-types/api";
import { ORDERS } from "metabase-types/api/mocks/presets";

import {
  aggregate,
  count,
  eventLogRows,
  funnelRows,
  mbqlInput,
  nativeColumn,
  nativeInput,
  nativeItem,
  ordersColumn,
  ordersQuery,
  peopleColumn,
  peopleQuery,
  stateRows,
  viaFk,
  withRows,
} from "./test-fixtures";
import type { Decision, DefaultVizInput } from "./types";

import { chooseDefaultViz, chooseDefaultVizTwoStage } from "./index";

const alternativeDisplays = (decision: Decision): CardDisplayType[] =>
  decision.alternatives.map((alternative) => alternative.display);

type Example = {
  name: string;
  input: () => DefaultVizInput;
  display: CardDisplayType;
  variant?: string | null;
  settings?: Record<string, unknown>;
  alternatives?: CardDisplayType[];
  provisional?: boolean;
};

const EXAMPLES: Example[] = [
  {
    name: "1. Orders count",
    input: () => mbqlInput(ordersQuery({ aggregations: [count] })),
    display: "scalar",
  },
  {
    name: "2. Orders count by Created At month",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [{ ...ordersColumn("CREATED_AT"), unit: "month" }],
        }),
      ),
    display: "line",
    settings: { "graph.x_axis.scale": "timeseries" },
    alternatives: ["area", "bar", "smartscalar"],
  },
  {
    name: "3. sum(Total), avg(Total) by month",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [
            aggregate("sum", ordersColumn("TOTAL")),
            aggregate("avg", ordersColumn("TOTAL")),
          ],
          breakouts: [{ ...ordersColumn("CREATED_AT"), unit: "month" }],
        }),
      ),
    display: "line",
    variant: "auto-split",
    settings: { "graph.y_axis.auto_split": true },
    alternatives: ["combo"],
  },
  {
    name: "4. count by Product -> Category",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [viaFk("CATEGORY", ORDERS.PRODUCT_ID)],
        }),
      ),
    display: "bar",
    settings: { "graph.show_values": true },
    alternatives: ["pie"],
  },
  {
    name: "5. People count by State",
    input: () =>
      mbqlInput(
        peopleQuery({
          aggregations: [count],
          breakouts: [peopleColumn("STATE")],
        }),
      ),
    display: "map",
    variant: "region",
    settings: { "map.type": "region", "map.region": "us_states" },
  },
  {
    name: "6. count by month, Category",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [
            { ...ordersColumn("CREATED_AT"), unit: "month" },
            viaFk("CATEGORY", ORDERS.PRODUCT_ID),
          ],
        }),
      ),
    display: "line",
    settings: { "graph.dimensions": ["CREATED_AT", "CATEGORY"] },
  },
  {
    name: "7. count by Created At day-of-week",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [{ ...ordersColumn("CREATED_AT"), unit: "day-of-week" }],
        }),
      ),
    display: "bar",
    settings: { "graph.x_axis.scale": "ordinal" },
  },
  {
    name: "8. count by Total auto-binned",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [{ ...ordersColumn("TOTAL"), bins: "auto" }],
        }),
      ),
    display: "bar",
    settings: { "graph.x_axis.scale": "histogram" },
  },
  {
    name: "9. avg(Rating) by Product -> Vendor",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [aggregate("avg", viaFk("RATING", ORDERS.PRODUCT_ID))],
          breakouts: [viaFk("VENDOR", ORDERS.PRODUCT_ID)],
        }),
      ),
    display: "table",
    variant: "mini-bar",
    settings: {
      column_settings: {
        [getColumnKey({ name: "avg" })]: { show_mini_bar: true },
      },
    },
    alternatives: ["row"],
  },
  {
    name: "10. count by People -> Source, Product -> Category",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [
            viaFk("SOURCE", ORDERS.USER_ID),
            viaFk("CATEGORY", ORDERS.PRODUCT_ID),
          ],
        }),
      ),
    display: "bar",
    variant: "stacked",
    settings: {
      "stackable.stack_type": "stacked",
      "graph.dimensions": ["SOURCE", "CATEGORY"],
    },
  },
  {
    name: "11. sum(Total) by Created At year, People -> State",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [aggregate("sum", ordersColumn("TOTAL"))],
          breakouts: [
            { ...ordersColumn("CREATED_AT"), unit: "year" },
            viaFk("STATE", ORDERS.USER_ID),
          ],
        }),
      ),
    display: "pivot",
    settings: {
      "pivot_table.column_split": {
        columns: ["CREATED_AT"],
        rows: ["STATE"],
        values: ["sum"],
      },
    },
  },
  {
    name: "12. sum(Total) by Latitude binned, Longitude binned",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [aggregate("sum", ordersColumn("TOTAL"))],
          breakouts: [
            { ...viaFk("LATITUDE", ORDERS.USER_ID), bins: "auto" },
            { ...viaFk("LONGITUDE", ORDERS.USER_ID), bins: "auto" },
          ],
        }),
      ),
    display: "map",
    variant: "grid",
    settings: { "map.type": "grid" },
  },
  {
    name: "13. native status/count (stage 1)",
    input: () => statusCountInput(),
    display: "bar",
  },
  {
    name: "14. native created_at/amount raw (stage 1)",
    input: () => paymentsInput(),
    display: "line",
    provisional: true,
  },
  {
    name: "15. native lat/lon/name",
    input: () =>
      nativeInput(
        "SELECT lat, lon, name FROM stores",
        [
          nativeColumn("lat", "type/Float", "type/Latitude"),
          nativeColumn("lon", "type/Float", "type/Longitude"),
          nativeColumn("name", "type/Text", "type/Name"),
        ],
        {
          aggregated: false,
          kind: "select",
          items: [
            nativeItem("lat", { semantic_type: "type/Latitude" }),
            nativeItem("lon", { semantic_type: "type/Longitude" }),
            nativeItem("name", { semantic_type: "type/Name" }),
          ],
        },
      ),
    display: "map",
    variant: "pin",
    settings: { "map.type": "pin", "map.pin_type": "markers" },
  },
  {
    name: "16. native price/rating",
    input: () =>
      nativeInput(
        "SELECT price, rating FROM products",
        [
          nativeColumn("price", "type/Float", "type/Price"),
          nativeColumn("rating", "type/Float", "type/Score"),
        ],
        {
          aggregated: false,
          kind: "select",
          items: [
            nativeItem("price", { semantic_type: "type/Price" }),
            nativeItem("rating", { semantic_type: "type/Score" }),
          ],
        },
      ),
    display: "scatter",
  },
  {
    name: "17. count by Product -> Title",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count],
          breakouts: [viaFk("TITLE", ORDERS.PRODUCT_ID)],
        }),
      ),
    display: "table",
    variant: "mini-bar",
    alternatives: ["row"],
  },
  {
    name: "18. count, distinct(User ID)",
    input: () =>
      mbqlInput(
        ordersQuery({
          aggregations: [count, aggregate("distinct", ordersColumn("USER_ID"))],
        }),
      ),
    display: "scalar",
    settings: { "scalar.field": "count" },
  },
];

function statusCountInput(
  extra: Partial<DefaultVizInput> = {},
): DefaultVizInput {
  return nativeInput(
    "SELECT status, count(*) FROM tickets GROUP BY 1 ORDER BY 2 DESC",
    [
      nativeColumn("status", "type/Text", "type/Category"),
      nativeColumn("count", "type/Integer"),
    ],
    {
      aggregated: true,
      kind: "select",
      items: [
        nativeItem("status", {
          in_group_by: true,
          semantic_type: "type/Category",
        }),
        nativeItem("count", { kind: "aggregate", fn: "COUNT" }),
      ],
    },
    extra,
  );
}

function paymentsInput(extra: Partial<DefaultVizInput> = {}): DefaultVizInput {
  return nativeInput(
    "SELECT created_at, amount FROM payments LIMIT 500",
    [
      nativeColumn("created_at", "type/DateTime"),
      nativeColumn("amount", "type/Float"),
    ],
    {
      aggregated: false,
      kind: "select",
      items: [nativeItem("created_at"), nativeItem("amount")],
    },
    extra,
  );
}

describe("chooseDefaultViz worked examples", () => {
  it.each(EXAMPLES)("$name", (example) => {
    const decision = chooseDefaultViz(example.input());
    const actual = {
      display: decision.display,
      variant: decision.variant,
      settings: decision.settings,
      provisional: decision.provisional,
    };
    expect(actual).toMatchObject({
      display: example.display,
      ...(example.variant !== undefined ? { variant: example.variant } : {}),
      ...(example.settings ? { settings: example.settings } : {}),
      ...(example.provisional !== undefined
        ? { provisional: example.provisional }
        : {}),
    });
    expect(alternativeDisplays(decision)).toEqual(
      expect.arrayContaining(example.alternatives ?? []),
    );
  });
});

describe("chooseDefaultVizTwoStage worked examples", () => {
  it("5. People count by State falls back to row/bar when 40% of keys are junk", () => {
    const query = peopleQuery({
      aggregations: [count],
      breakouts: [peopleColumn("STATE")],
    });
    const { stage1, final } = chooseDefaultVizTwoStage(
      withRows(mbqlInput(query), stateRows(0.4)),
    );
    expect(stage1.display).toBe("map");
    expect(["row", "bar"]).toContain(final.display);
    expect(final.trace.reconcile?.outcome).toBe("switched-infeasible");
  });

  it("13. native status/count becomes a funnel with 5 monotone decreasing rows", () => {
    const { stage1, final } = chooseDefaultVizTwoStage(
      withRows(statusCountInput(), funnelRows()),
    );
    expect(stage1.display).toBe("bar");
    expect(final.display).toBe("funnel");
    expect(final.settings).toMatchObject({
      "funnel.dimension": "status",
      "funnel.metric": "count",
    });
  });

  it("14. native created_at/amount becomes a table with 500 unique timestamps", () => {
    const { stage1, final } = chooseDefaultVizTwoStage(
      withRows(paymentsInput(), eventLogRows(500)),
    );
    expect(stage1.display).toBe("line");
    expect(stage1.provisional).toBe(true);
    expect(final.display).toBe("table");
    expect(alternativeDisplays(final)).toContain("line");
  });
});
