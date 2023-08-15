import { t } from "ttag";

export const totalQueryExecutionsByDb = () => ({
  card: {
    name: t`Total queries and their average speed`,
    display: "bar",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.databases/total-query-executions-by-db",
      args: [],
    },
    visualization_settings: {
      "graph.metrics": ["queries", "avg_running_time"],
      "graph.dimensions": ["database_id"],
      "graph.x_axis.title_text": "Database",
      "graph.x_axis.axis_enabled": true,
      "graph.y_axis.axis_enabled": true,
      "graph.y_axis.auto_split": true,
    },
  },
});

// DEPRECATED
export const queryExecutionsPerDbPerDay = () => ({
  card: {
    name: t`Queries per database each day`,
    display: "line",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.databases/query-executions-per-db-per-day",
      args: [],
    },
    visualization_settings: {
      "graph.dimensions": ["date", "database_id"],
      "graph.metrics": ["count"],
    },
  },
});

export const table = searchString => ({
  card: {
    name: "Databases",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.databases/table",
      args: searchString ? [searchString] : [],
    },
    visualization_settings: {
      "table.columns": [
        { name: "database_id", enabled: true },
        { name: "schemas", enabled: true },
        { name: "tables", enabled: true },
        { name: "sync_schedule", enabled: true },
        { name: "cache_ttl", enabled: true },
        { name: "added_on", enabled: true, date_format: "M/D/YYYY, h:mm A" },
      ],
    },
  },
});
