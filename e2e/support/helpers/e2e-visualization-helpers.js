import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS, ORDERS_ID, PRODUCTS } from "metabase-types/api/mocks/presets";

export function createFunnelBarQuestion() {
  const query = {
    name: `funnel`,
    native: {
      query: `SELECT * FROM ( VALUES ('Stage 1', 1000), ('Stage 2', 400), ('Stage 3', 250), ('Stage 4', 100), ('Stage 5', 20), ('Stage 6', 10))`,
      "template-tags": {},
    },
    visualization_settings: {},
    display: "funnel",
    database: SAMPLE_DB_ID,
  };

  return query;
}

/**
 * @param {number[]} range
 * @param {string[]=} range
 * @param {object=} columnSettings
 */
export function createGaugeQuestion(range, labels, columnSettings) {
  const colors = ["#ED6E6E", "#F9CF48", "#84BB4C", "#509EE3"];
  return {
    name: `Gauge chart with range "${range}"`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
    visualization_settings: {
      "gauge.segments": range
        .map((value, index) => {
          const nextValue = range[index + 1];
          if (nextValue) {
            return {
              min: value,
              max: nextValue,
              color: colors[index],
              label: labels?.[index] || `Label ${index + 1}`,
            };
          }
        })
        .filter(value => value),
      ...(columnSettings && { column_settings: columnSettings }),
    },
    display: "gauge",
    database: SAMPLE_DB_ID,
  };
}

export function createOneDimensionOneMetricQuestion(display) {
  return {
    name: `${display} one dimension one metric`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
      "graph.show_values": true,
    },
    display: display,
    database: SAMPLE_DB_ID,
  };
}

export function createOneDimensionTwoMetricsQuestion(display) {
  return {
    name: `${display} one dimension two metrics`,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count", "avg"],
      "graph.show_values": true,
    },
    display: display,
    database: SAMPLE_DB_ID,
  };
}

export function createOneMetricTwoDimensionsQuestion(visualizationType) {
  return {
    name: `${visualizationType} one metric two dimensions`,
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
      "graph.show_values": true,
    },
    display: visualizationType,
    database: SAMPLE_DB_ID,
  };
}

export function createPieQuestion({ percentVisibility, showTotal }) {
  const query = {
    name: `pie showDataLabels=${percentVisibility}, showTotal=${showTotal}`,
    native: {
      query:
        "select 1 x, 1000 y\n" +
        "union all select 2, 800\n" +
        "union all select 3, 100\n" +
        "union all select 4, 180\n" +
        "union all select 5, 500\n" +
        "union all select 6, 180\n" +
        "union all select 7, 100\n" +
        "union all select 8, 10\n",
      "template-tags": {},
    },
    visualization_settings: {
      "pie.percent_visibility": percentVisibility,
      "pie.show_total": showTotal,
    },
    display: "pie",
    database: SAMPLE_DB_ID,
  };

  return query;
}

export function createProgressBarQuestion({ value, goal }) {
  const query = {
    name: `progress bar value=${value} goal=${goal}`,
    native: {
      query: `SELECT ${value}`,
      "template-tags": {},
    },
    visualization_settings: {
      "progress.goal": goal,
    },
    display: "progress",
    database: SAMPLE_DB_ID,
  };

  return query;
}

export function createSingleSeriesRowChart() {
  return {
    name: `Single series row chart`,
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
    display: "row",
    database: SAMPLE_DB_ID,
  };
}

export function createWaterfallQuestion({ showTotal } = {}) {
  const query = {
    name: `waterfall showTotal=${showTotal}`,
    native: {
      query:
        "SELECT * FROM ( VALUES ('Stage 1', 10), ('Stage 2', 30), ('Stage 3', -50), ('Stage 4', -10), ('Stage 5', 80), ('Stage 6', 10), ('Stage 7', 15))",
      "template-tags": {},
    },
    visualization_settings: {
      "graph.show_values": true,
    },
    display: "waterfall",
    database: SAMPLE_DB_ID,
  };

  if (typeof showTotal !== "undefined") {
    query.visualization_settings["waterfall.show_total"] = showTotal;
  }

  return query;
}
