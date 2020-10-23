/* @flow */

export const viewsAndAvgExecutionTimeByDay = () => ({
  card: {
    name: "Query views and speed per day",
    display: "line",
    dataset_query: {
      type: "internal",
      fn:
        "metabase-enterprise.audit.pages.queries/views-and-avg-execution-time-by-day",
      args: [],
    },
    visualization_settings: {
      "graph.metrics": ["queries", "avg_running_time"],
      "graph.dimensions": ["database"],
      "graph.x_axis.title_text": "Time",
      "graph.x_axis.axis_enabled": true,
      "graph.y_axis.axis_enabled": true,
      "graph.y_axis.auto_split": true,
    },
  },
});

export const mostPopular = () => ({
  card: {
    name: "Most popular queries",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.queries/most-popular",
      args: [],
    },
    visualization_settings: {
      "graph.metrics": ["executions"],
      "graph.dimensions": ["card_id"],
    },
  },
});

export const slowest = () => ({
  card: {
    name: "Slowest queries",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.queries/slowest",
      args: [],
    },
    visualization_settings: {
      "graph.metrics": ["avg_running_time"],
      "graph.dimensions": ["card_id"],
    },
  },
});

export const table = (searchString?: string) => ({
  card: {
    name: "Questions",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.queries/table",
      args: searchString ? [searchString] : [],
    },
    visualization_settings: {
      "table.columns": [
        { name: "card_id", enabled: true },
        { name: "collection_id", enabled: true },
        { name: "database_id", enabled: true },
        { name: "table_id", enabled: true },
        { name: "user_id", enabled: true },
        {
          name: "public_link",
          enabled: true,
          markdown_template: "[Link]({{value}})",
        },
        { name: "cache_ttl", enabled: true },
        { name: "total_views", enabled: true },
      ],
    },
  },
});
