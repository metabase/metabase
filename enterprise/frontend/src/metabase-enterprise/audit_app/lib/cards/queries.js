import { t } from "ttag";

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
