const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers/api";
import type { CardId } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
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

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// Not using the one from "metabase/visualizer/utils"
// because it creates a circular dependency
function createDataSourceNameRef(
  id: VisualizerDataSourceId,
): VisualizerDataSourceNameReference {
  return `$_${id}_name`;
}

function createDatetimeColumn(opts: any = {}) {
  return createMockColumn({
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: null,
    unit: "month",
    ...opts,
  });
}

function createCategoryColumn(opts: any = {}) {
  return createMockColumn({
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });
}

function createNumericColumn(opts: any = {}) {
  return createMockColumn({
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: null,
    ...opts,
  });
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
      ordersCountByProductCategoryQuestionId,
      productsCountByCategoryQuestionId,
      productsCountByCreatedAtQuestionId,
      landingPageViewsScalarQuestionId,
      checkoutPageViewsScalarQuestionId,
      paymentDonePageViewsScalarQuestionId,
      stepColumnQuestionId,
      viewsColumnQuestionId,
    } = this;

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      const dc1 = createVisualizerDashcardWithTimeseriesBreakout(
        ordersCountByCreatedAtQuestionId,
        productsCountByCreatedAtQuestionId,
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
        productsCountByCategoryQuestionId,
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
        viewsColumnQuestionId,
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
        checkoutPageViewsScalarQuestionId,
        paymentDonePageViewsScalarQuestionId,
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
  productsCountByCreatedAtQuestionId: CardId,
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
        columns: [
          createDatetimeColumn({
            id: ORDERS.CREATED_AT,
            name: "COLUMN_1",
            display_name: "Created At: Month",
          }),
          createNumericColumn({
            name: "COLUMN_2",
            display_name: "Count",
          }),
          createDatetimeColumn({
            id: PRODUCTS.CREATED_AT,
            name: "COLUMN_3",
            display_name: `Created At: Month (${PRODUCTS_COUNT_BY_CREATED_AT.name})`,
          }),
          createNumericColumn({
            name: "COLUMN_4",
            display_name: `Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`,
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CREATED_AT",
              sourceId: `card:${ordersCountByCreatedAtQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${ordersCountByCreatedAtQuestionId}`,
            },
          ],
          COLUMN_3: [
            {
              name: "COLUMN_3",
              originalName: "CREATED_AT",
              sourceId: `card:${productsCountByCreatedAtQuestionId}`,
            },
          ],
          COLUMN_4: [
            {
              name: "COLUMN_4",
              originalName: "count",
              sourceId: `card:${productsCountByCreatedAtQuestionId}`,
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
  productsCountByCategoryQuestionId: CardId,
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
        columns: [
          createCategoryColumn({
            id: PRODUCTS.CATEGORY,
            fk_field_id: ORDERS.PRODUCT_ID,
            name: "COLUMN_1",
            display_name: "Category",
          }),
          createNumericColumn({
            name: "COLUMN_2",
            display_name: "Count",
          }),
          createCategoryColumn({
            id: PRODUCTS.CATEGORY,
            name: "COLUMN_3",
            display_name: `Category (${PRODUCTS_COUNT_BY_CATEGORY.name})`,
          }),
          createNumericColumn({
            name: "COLUMN_4",
            display_name: `Count (${PRODUCTS_COUNT_BY_CATEGORY.name})`,
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CATEGORY",
              sourceId: `card:${ordersCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${ordersCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_3: [
            {
              name: "COLUMN_3",
              originalName: "CATEGORY",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_4: [
            {
              name: "COLUMN_4",
              originalName: "count",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
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
  dashcardOpts = {},
) {
  return {
    id: -1,
    card_id: productsCountByCategoryQuestionId,
    ...dashcardOpts,
    visualization_settings: {
      visualization: {
        display: "pie",
        columns: [
          createCategoryColumn({
            id: PRODUCTS.CATEGORY,
            name: "COLUMN_1",
            display_name: "Category",
          }),
          createNumericColumn({
            name: "COLUMN_2",
            display_name: "Count",
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CATEGORY",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
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
  viewsColumnQuestionId: CardId,
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
        columns: [
          createCategoryColumn({ name: "COLUMN_1", display_name: "Step" }),
          createNumericColumn({ name: "COLUMN_2", display_name: "Views" }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "Step",
              sourceId: `card:${stepColumnQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "Views",
              sourceId: `card:${viewsColumnQuestionId}`,
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
  checkoutPageViewsScalarQuestionId: CardId,
  paymentDonePageViewsScalarQuestionId: CardId,
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
        columns: [
          createNumericColumn({ name: "METRIC", display_name: "METRIC" }),
          createCategoryColumn({
            name: "DIMENSION",
            display_name: "DIMENSION",
          }),
        ],
        columnValuesMapping: {
          METRIC: [
            {
              sourceId: `card:${landingPageViewsScalarQuestionId}`,
              originalName: "views",
              name: "COLUMN_1",
            },
            {
              sourceId: `card:${checkoutPageViewsScalarQuestionId}`,
              originalName: "views",
              name: "COLUMN_2",
            },
            {
              sourceId: `card:${paymentDonePageViewsScalarQuestionId}`,
              originalName: "views",
              name: "COLUMN_3",
            },
          ],
          DIMENSION: [
            createDataSourceNameRef(`card:${landingPageViewsScalarQuestionId}`),
            createDataSourceNameRef(
              `card:${checkoutPageViewsScalarQuestionId}`,
            ),
            createDataSourceNameRef(
              `card:${paymentDonePageViewsScalarQuestionId}`,
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
