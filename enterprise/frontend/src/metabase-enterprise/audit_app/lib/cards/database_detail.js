export const auditLog = (databaseId: number) => ({
  card: {
    name: "Audit log",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.database-detail/audit-log",
      args: [databaseId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "user_id", enabled: true },
        { name: "card_id", enabled: true },
        { name: "schema", enabled: true },
        { name: "table_id", enabled: true },
        { name: "started_at", enabled: true, date_format: "M/D/YYYY, h:mm A" },
      ],
    },
  },
});
