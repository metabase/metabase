export const ROW_CHART_TYPE = "row";

export const ROW_CHART_DEFAULT_OPTIONS = {
  settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
  data: {
    cols: [
      {
        name: "CATEGORY",
        fk_field_id: 13,
        field_ref: [
          "field",
          4,
          {
            "source-field": 13,
          },
        ],
        effective_type: "type/Text",
        id: 4,
        display_name: "Product → Category",
        base_type: "type/Text",
        source_alias: "PRODUCTS__via__PRODUCT_ID",
      },
      {
        base_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        name: "count",
        display_name: "Count",
        source: "aggregation",
        field_ref: ["aggregation", 0],
        effective_type: "type/BigInteger",
      },
    ],
    rows: [
      ["Doohickey", 3976],
      ["Gadget", 4939],
      ["Gizmo", 4784],
      ["Widget", 5061],
    ],
  },
};

// query: {
//       "source-table": ORDERS_ID,
//       aggregation: [["count"]],
//       breakout: [
//         ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
//       ],
//     },
//     visualization_settings: {
//       "graph.dimensions": ["CATEGORY"],
//       "graph.metrics": ["count"],
//     },
