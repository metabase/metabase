import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers/api";

const {
  PRODUCTS,
  PRODUCTS_ID,
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  ACCOUNTS_ID,
  ACCOUNTS,
} = SAMPLE_DATABASE;

export const ORDERS_COUNT_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "line",
  name: "Orders by Created At (Month)",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const ORDERS_COUNT_BY_PRODUCT_CATEGORY: StructuredQuestionDetails = {
  display: "bar",
  name: "Orders by Product Category",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

export const ACCOUNTS_COUNT_BY_COUNTRY: StructuredQuestionDetails = {
  display: "bar",
  name: "Accounts by Country",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [["field", ACCOUNTS.COUNTRY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["COUNTRY"],
    "graph.metrics": ["count"],
  },
};

export const ACCOUNTS_COUNT_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "bar",
  name: "Accounts by Created At (Month)",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [["field", ACCOUNTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY: StructuredQuestionDetails =
  {
    display: "line",
    name: "Orders by Created At (Month) & Category",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["count"],
    },
  };

export const PRODUCTS_COUNT_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "bar",
  name: "Products by Created At (Month)",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY: StructuredQuestionDetails =
  {
    display: "bar",
    name: "Products by Created At (Month) and Category",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PRODUCTS.CATEGORY, null],
      ],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["count"],
    },
  };

export const PRODUCTS_AVERAGE_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "bar",
  name: "Products average by Created At (Month)",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_COUNT_BY_CATEGORY: StructuredQuestionDetails = {
  display: "bar",
  name: "Products by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_AVERAGE_BY_CATEGORY: StructuredQuestionDetails = {
  display: "bar",
  name: "Products average by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["avg"],
  },
};

export const PRODUCTS_COUNT_BY_CATEGORY_PIE: StructuredQuestionDetails = {
  ...PRODUCTS_COUNT_BY_CATEGORY,
  display: "pie",
  name: "Products by Category (Pie)",
};

export const SCALAR_CARD: Record<string, NativeQuestionDetails> = {
  LANDING_PAGE_VIEWS: {
    display: "scalar",
    name: "Landing Page",
    native: {
      query: 'SELECT 1000 as "views"',
    },
  },
  CHECKOUT_PAGE_VIEWS: {
    display: "scalar",
    name: "Checkout Page",
    native: {
      query: 'SELECT 600 as "views"',
    },
  },
  PAYMENT_DONE_PAGE_VIEWS: {
    display: "scalar",
    name: "Payment Done Page",
    native: {
      query: 'SELECT 100 as "views"',
    },
  },
};

export const PIVOT_TABLE_CARD: StructuredQuestionDetails = {
  name: "Pivot table",
  display: "pivot",
  query: {
    aggregation: [["count"], ["avg", ["field", ORDERS.QUANTITY, null]]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
    "source-table": ORDERS_ID,
  },
};

export const STEP_COLUMN_CARD: NativeQuestionDetails = {
  name: "Step Column",
  display: "table",
  native: {
    query: `
      SELECT 'Landing page' AS "Step"
      UNION
      SELECT 'Checkout page' AS "Step"
      UNION
      SELECT 'Payment done page' AS "Step"
    `,
  },
};

export const VIEWS_COLUMN_CARD: NativeQuestionDetails = {
  name: "Views Column",
  display: "table",
  native: {
    query: `
      SELECT 1000 as "Views"
      UNION
      SELECT 600 as "Views"
      UNION
      SELECT 100 as "Views"
    `,
  },
};

export const ACCOUNTS_COUNT_BY_CREATED_AT_AREA: StructuredQuestionDetails = {
  ...ACCOUNTS_COUNT_BY_CREATED_AT,
  display: "area",
  name: "Accounts by Created At (Area)",
};

export const PRODUCTS_AVERAGE_BY_CATEGORY_ROW: StructuredQuestionDetails = {
  ...PRODUCTS_AVERAGE_BY_CATEGORY,
  display: "row",
  name: "Products avg by Category (Row)",
};

export const PRODUCTS_AVERAGE_BY_CATEGORY_WATERFALL: StructuredQuestionDetails =
  {
    ...PRODUCTS_AVERAGE_BY_CATEGORY,
    display: "waterfall",
    name: "Products avg by Category (Waterfall)",
  };

export const PRODUCTS_COUNT_SUM_BY_CREATED_AT_COMBO: StructuredQuestionDetails =
  {
    name: "Products count & sum by Created At (Combo)",
    display: "combo",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
      breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count", "sum"],
      "graph.show_values": true,
    },
  };

export const ORDERS_CREATED_AT_SCATTER: StructuredQuestionDetails = {
  name: "Orders by Created At (Scatter)",
  display: "scatter",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      [
        "distinct",
        ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count", "count_2"],
  },
};

export const PEOPLE_LOCATION_MAP: NativeQuestionDetails = {
  name: "People by Location (Map)",
  display: "map",
  native: {
    query:
      'SELECT -80 AS "LNG", 40 AS "LAT" UNION ALL SELECT -120 AS "LNG", 40 AS "LAT"',
  },
  visualization_settings: {
    "map.type": "pin",
    "map.latitude_column": "LAT",
    "map.longitude_column": "LNG",
  },
};

export const PEOPLE_SOURCE_FUNNEL: StructuredQuestionDetails = {
  name: "People by Source (Funnel)",
  display: "funnel",
  query: {
    "source-table": PEOPLE_ID,
    aggregation: [["count"]],
    breakout: [["field", SAMPLE_DATABASE.PEOPLE.SOURCE, null]],
  },
  visualization_settings: {
    "funnel.dimension": "SOURCE",
    "funnel.metric": "count",
  },
};

export const SAMPLE_FLOW_SANKEY: NativeQuestionDetails = {
  name: "Sample Flow (Sankey)",
  display: "sankey",
  native: {
    query: `
      SELECT 'Social Media' AS source, 'Landing Page' AS target, 30000 AS metric
      UNION ALL
      SELECT 'Email Campaign', 'Landing Page', 20000
      UNION ALL
      SELECT 'Paid Search', 'Landing Page', 25000
      UNION ALL
      SELECT 'Landing Page', 'Signup Form', 60000
      UNION ALL
      SELECT 'Signup Form', 'Free Trial', 40000
      UNION ALL
      SELECT 'Signup Form', 'Abandoned Signup', 20000
      UNION ALL
      SELECT 'Free Trial', 'Onboarding', 30000
      UNION ALL
      SELECT 'Free Trial', 'Churned During Trial', 10000
      UNION ALL
      SELECT 'Onboarding', 'Active Users', 25000
      UNION ALL
      SELECT 'Onboarding', 'Churned After Onboarding', 5000
      UNION ALL
      SELECT 'Active Users', 'Paid Subscription', 20000
      UNION ALL
      SELECT 'Active Users', 'Cancelled Subscription', 5000
    `,
  },
  visualization_settings: {
    "graph.show_values": true,
    "graph.label_value_formatting": "compact",
  },
};

export const ORDERS_COUNT_PROGRESS: StructuredQuestionDetails = {
  name: "Orders count (Progress)",
  display: "progress",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

export const ORDERS_CREATED_AT_SMARTSCALAR: StructuredQuestionDetails = {
  name: "Orders by Created At (SmartScalar)",
  display: "smartscalar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};
