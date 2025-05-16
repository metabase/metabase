const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers/api";
import type { CardId } from "metabase-types/api";
import type {
  VisualizerDataSourceId,
  VisualizerDataSourceNameReference,
} from "metabase-types/store/visualizer";

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

type NativeQuestionDetailsWithName = NativeQuestionDetails & {
  name: string;
};

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID, ACCOUNTS, ACCOUNTS_ID } =
  SAMPLE_DATABASE;

export const COUNTRY_CODES = [
  "(empty)",
  "AE",
  "AF",
  "AG",
  "AL",
  "AM",
  "AR",
  "AT",
  "AU",
  "BA",
  "BD",
  "BE",
  "BF",
  "BG",
  "BN",
  "BO",
  "BR",
  "BT",
  "BW",
  "BY",
  "CA",
  "CD",
  "CH",
  "CI",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CY",
  "CZ",
  "DE",
  "DK",
  "DO",
  "DZ",
  "EE",
  "EG",
  "ES",
  "ET",
  "FI",
  "FR",
  "GB",
  "GE",
  "GM",
  "GN",
  "GR",
  "GT",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IQ",
  "IR",
  "IT",
  "JM",
  "JO",
  "JP",
  "KE",
  "KH",
  "KI",
  "KM",
  "KR",
  "KZ",
  "LA",
  "LC",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MD",
  "MG",
  "MK",
  "ML",
  "MM",
  "MT",
  "MU",
  "MW",
  "MX",
  "MY",
  "NE",
  "NG",
  "NI",
  "NL",
  "NO",
  "NZ",
  "PA",
  "PE",
  "PH",
  "PK",
  "PL",
  "PT",
  "PW",
  "PY",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SE",
  "SI",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SV",
  "SY",
  "SZ",
  "TH",
  "TJ",
  "TN",
  "TO",
  "TR",
  "TZ",
  "UA",
  "UG",
  "US",
  "UZ",
  "VE",
  "VN",
  "YE",
  "ZA",
  "ZM",
  "ZW",
];

// Not using the one from "metabase/visualizer/utils"
// because it creates a circular dependency
function createDataSourceNameRef(
  id: VisualizerDataSourceId,
): VisualizerDataSourceNameReference {
  return `$_${id}_name`;
}

export const ORDERS_COUNT_BY_CREATED_AT: StructuredQuestionDetailsWithName = {
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

export const ORDERS_COUNT_BY_PRODUCT_CATEGORY: StructuredQuestionDetailsWithName =
  {
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

export const ACCOUNTS_COUNT_BY_COUNTRY: StructuredQuestionDetailsWithName = {
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

export const ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY: StructuredQuestionDetailsWithName =
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

export const PRODUCTS_COUNT_BY_CREATED_AT: StructuredQuestionDetailsWithName = {
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

export const PRODUCTS_AVERAGE_BY_CREATED_AT: StructuredQuestionDetailsWithName =
  {
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

export const PRODUCTS_COUNT_BY_CATEGORY: StructuredQuestionDetailsWithName = {
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

export const PRODUCTS_AVERAGE_BY_CATEGORY: StructuredQuestionDetailsWithName = {
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

export const PRODUCTS_COUNT_BY_CATEGORY_PIE: StructuredQuestionDetailsWithName =
  {
    ...PRODUCTS_COUNT_BY_CATEGORY,
    display: "pie",
    name: "Products by Category (Pie)",
  };

export const SCALAR_CARD: Record<string, NativeQuestionDetailsWithName> = {
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

export const PIVOT_TABLE_CARD: StructuredQuestionDetailsWithName = {
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

export const STEP_COLUMN_CARD: NativeQuestionDetailsWithName = {
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

export const VIEWS_COLUMN_CARD: NativeQuestionDetailsWithName = {
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

export function createDashboardWithVisualizerDashcards() {
  cy.get("@ordersCountByCreatedAtQuestionId").then(function () {
    const {
      ordersCountByCreatedAtQuestionId,
      ordersCountByCreatedAtQuestionEntityId,
      ordersCountByProductCategoryQuestionId,
      ordersCountByProductCategoryQuestionEntityId,
      productsCountByCategoryQuestionId,
      productsCountByCategoryQuestionEntityId,
      productsCountByCreatedAtQuestionId,
      productsCountByCreatedAtQuestionEntityId,
      landingPageViewsScalarQuestionId,
      landingPageViewsScalarQuestionEntityId,
      checkoutPageViewsScalarQuestionId,
      checkoutPageViewsScalarQuestionEntityId,
      paymentDonePageViewsScalarQuestionId,
      paymentDonePageViewsScalarQuestionEntityId,
      stepColumnQuestionId,
      stepColumnQuestionEntityId,
      viewsColumnQuestionId,
      viewsColumnQuestionEntityId,
    } = this;

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      const dc1 = createVisualizerDashcardWithTimeseriesBreakout(
        ordersCountByCreatedAtQuestionId,
        ordersCountByCreatedAtQuestionEntityId,
        productsCountByCreatedAtQuestionId,
        productsCountByCreatedAtQuestionEntityId,
        {
          id: -1,
          col: 0,
          row: 0,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc2 = createVisualizerDashcardWithCategoryBreakout(
        ordersCountByProductCategoryQuestionId,
        ordersCountByProductCategoryQuestionEntityId,
        productsCountByCategoryQuestionId,
        productsCountByCategoryQuestionEntityId,
        {
          id: -2,
          col: 12,
          row: 0,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc3 = createVisualizerPieChartDashcard(
        productsCountByCategoryQuestionId,
        productsCountByCategoryQuestionEntityId,
        {
          id: -3,
          col: 0,
          row: 8,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc4 = {
        id: -4,
        card_id: productsCountByCreatedAtQuestionId,

        col: 12,
        row: 8,
        size_x: 12,
        size_y: 8,
      };

      const dc5 = createVisualizerFunnel(
        stepColumnQuestionId,
        stepColumnQuestionEntityId,
        viewsColumnQuestionId,
        viewsColumnQuestionEntityId,
        {
          id: -5,
          col: 0,
          row: 16,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc6 = createVisualizerScalarFunnel(
        landingPageViewsScalarQuestionId,
        landingPageViewsScalarQuestionEntityId,
        checkoutPageViewsScalarQuestionId,
        checkoutPageViewsScalarQuestionEntityId,
        paymentDonePageViewsScalarQuestionId,
        paymentDonePageViewsScalarQuestionEntityId,
        {
          id: -6,
          col: 12,
          row: 16,
          size_x: 12,
          size_y: 8,
        },
      );

      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        dashcards: [dc1, dc2, dc3, dc4, dc5, dc6],
      }).then(() => {
        H.visitDashboard(dashboardId);
      });
    });
  });
}

export function createVisualizerDashcardWithTimeseriesBreakout(
  ordersCountByCreatedAtQuestionId: CardId,
  ordersCountByCreatedAtQuestionEntityId: string,
  productsCountByCreatedAtQuestionId: CardId,
  productsCountByCreatedAtQuestionEntityId: string,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: ordersCountByCreatedAtQuestionId,
    series: [
      {
        id: productsCountByCreatedAtQuestionId,
        ...PRODUCTS_COUNT_BY_CREATED_AT,
      },
    ],

    visualization_settings: {
      visualization: {
        display: "line",
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CREATED_AT",
              sourceId: `card:${ordersCountByCreatedAtQuestionEntityId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${ordersCountByCreatedAtQuestionEntityId}`,
            },
          ],
          COLUMN_3: [
            {
              name: "COLUMN_3",
              originalName: "CREATED_AT",
              sourceId: `card:${productsCountByCreatedAtQuestionEntityId}`,
            },
          ],
          COLUMN_4: [
            {
              name: "COLUMN_4",
              originalName: "count",
              sourceId: `card:${productsCountByCreatedAtQuestionEntityId}`,
            },
          ],
        },
        settings: {
          "card.title": "My chart",
          "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
          "graph.metrics": ["COLUMN_2", "COLUMN_4"],
        },
      },
    },
  };
}

export function createVisualizerDashcardWithCategoryBreakout(
  ordersCountByCategoryQuestionId: CardId,
  ordersCountByCategoryQuestionEntityId: string,
  productsCountByCategoryQuestionId: CardId,
  productsCountByCategoryQuestionEntityId: string,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: ordersCountByCategoryQuestionId,
    series: [
      {
        id: productsCountByCategoryQuestionId,
        ...PRODUCTS_COUNT_BY_CATEGORY,
      },
    ],

    visualization_settings: {
      visualization: {
        display: "bar",
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CATEGORY",
              sourceId: `card:${ordersCountByCategoryQuestionEntityId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${ordersCountByCategoryQuestionEntityId}`,
            },
          ],
          COLUMN_3: [
            {
              name: "COLUMN_3",
              originalName: "CATEGORY",
              sourceId: `card:${productsCountByCategoryQuestionEntityId}`,
            },
          ],
          COLUMN_4: [
            {
              name: "COLUMN_4",
              originalName: "count",
              sourceId: `card:${productsCountByCategoryQuestionEntityId}`,
            },
          ],
        },
        settings: {
          "card.title": "My category chart",
          "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
          "graph.metrics": ["COLUMN_2", "COLUMN_4"],
        },
      },
    },
  };
}

export function createVisualizerPieChartDashcard(
  productsCountByCategoryQuestionId: CardId,
  productsCountByCategoryQuestionEntityId: string,
  dashcardOpts = {},
) {
  return {
    id: -1,
    card_id: productsCountByCategoryQuestionId,
    ...dashcardOpts,
    visualization_settings: {
      visualization: {
        display: "pie",
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CATEGORY",
              sourceId: `card:${productsCountByCategoryQuestionEntityId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${productsCountByCategoryQuestionEntityId}`,
            },
          ],
        },
        settings: {
          "pie.metric": "COLUMN_2",
          "pie.dimension": ["COLUMN_1"],
        },
      },
    },
  };
}

export function createVisualizerFunnel(
  stepColumnQuestionId: CardId,
  stepColumnQuestionEntityId: string,
  viewsColumnQuestionId: CardId,
  viewsColumnQuestionEntityId: string,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: stepColumnQuestionId,
    series: [{ id: viewsColumnQuestionId, ...VIEWS_COLUMN_CARD }],

    visualization_settings: {
      visualization: {
        display: "funnel",
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "Step",
              sourceId: `card:${stepColumnQuestionEntityId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "Views",
              sourceId: `card:${viewsColumnQuestionEntityId}`,
            },
          ],
        },
        settings: {
          "card.title": "Regular visualizer funnel",
          "funnel.metric": "COLUMN_2",
          "funnel.dimension": "COLUMN_1",
        },
      },
    },
  };
}

export function createVisualizerScalarFunnel(
  landingPageViewsScalarQuestionId: CardId,
  landingPageViewsScalarQuestionEntityId: string,
  checkoutPageViewsScalarQuestionId: CardId,
  checkoutPageViewsScalarQuestionEntityId: string,
  paymentDonePageViewsScalarQuestionId: CardId,
  paymentDonePageViewsScalarQuestionEntityId: string,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: landingPageViewsScalarQuestionId,
    series: [
      {
        id: checkoutPageViewsScalarQuestionId,
        ...SCALAR_CARD.CHECKOUT_PAGE_VIEWS,
      },
      {
        id: paymentDonePageViewsScalarQuestionId,
        ...SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS,
      },
    ],

    visualization_settings: {
      visualization: {
        display: "funnel",
        columnValuesMapping: {
          METRIC: [
            {
              sourceId: `card:${landingPageViewsScalarQuestionEntityId}`,
              originalName: "views",
              name: "COLUMN_1",
            },
            {
              sourceId: `card:${checkoutPageViewsScalarQuestionEntityId}`,
              originalName: "views",
              name: "COLUMN_2",
            },
            {
              sourceId: `card:${paymentDonePageViewsScalarQuestionEntityId}`,
              originalName: "views",
              name: "COLUMN_3",
            },
          ],
          DIMENSION: [
            createDataSourceNameRef(
              `card:${landingPageViewsScalarQuestionEntityId}`,
            ),
            createDataSourceNameRef(
              `card:${checkoutPageViewsScalarQuestionEntityId}`,
            ),
            createDataSourceNameRef(
              `card:${paymentDonePageViewsScalarQuestionEntityId}`,
            ),
          ],
        },
        settings: {
          "card.title": "Scalar funnel",
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
      },
    },
  };
}
