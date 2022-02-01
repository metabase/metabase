export const viewsAndAvgExecutionTimeByDay = () => ({
  card: {
    name: "Query views and speed per day",
    display: "line",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.queries/views-and-avg-execution-time-by-day",
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
      fn: "metabase-enterprise.audit-app.pages.queries/most-popular",
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
      fn: "metabase-enterprise.audit-app.pages.queries/slowest",
      args: [],
    },
    visualization_settings: {
      "graph.metrics": ["avg_running_time"],
      "graph.dimensions": ["card_id"],
    },
  },
});

export const bad_table = (
  errorFilter,
  dbFilter,
  collectionFilter,
  sortColumn,
  sortDirection,
) => ({
  card: {
    name: "Failing Questions",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.queries/bad-table",
      args: [
        errorFilter,
        dbFilter,
        collectionFilter,
        sortColumn,
        sortDirection,
      ],
    },
    visualization_settings: {
      "table.columns": [
        { name: "card_id", enabled: true },
        { name: "error_substr", enabled: true },
        { name: "collection_id", enabled: true },
        { name: "database_id", enabled: true },
        { name: "schema", enabled: true },
        { name: "table_id", enabled: true },
        { name: "last_run_at", enabled: true },
        { name: "total_runs", enabled: true },
        { name: "num_dashboards", enabled: true },
        { name: "user_id", enabled: true },
        { name: "updated_at", enabled: true },
      ],
    },
  },
});

export const table = (
  questionFilter,
  collectionFilter,
  sortColumn,
  sortDirection,
) => ({
  card: {
    name: "Questions",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.queries/table",
      args: [questionFilter, collectionFilter, sortColumn, sortDirection],
    },
    visualization_settings: {
      "table.columns": [
        { name: "card_id", enabled: true },
        { name: "query_runs", enabled: true },
        { name: "avg_exec_time_45", enabled: true },
        { name: "cache_ttl", enabled: true },
        { name: "total_runtime_45", enabled: true },
        { name: "database_id", enabled: true },
        { name: "table_id", enabled: true },
        { name: "collection_id", enabled: true },
        {
          name: "public_link",
          enabled: true,
          markdown_template: "[Link]({{value}})",
        },
      ],
    },
  },
});
