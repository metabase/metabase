export const auditLog = (tableId: number) => ({
  card: {
    name: "Audit log",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.table-detail/audit-log",
      args: [tableId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "user_id", enabled: true },
        { name: "card_id", enabled: true },
        { name: "started_at", enabled: true, date_format: "M/D/YYYY, h:mm A" },
      ],
    },
  },
});
