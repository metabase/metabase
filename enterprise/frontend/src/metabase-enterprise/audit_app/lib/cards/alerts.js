export const alerts = questionName => ({
  card: {
    name: "Alerts",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.subscriptions/alerts-table",
      args: [questionName],
    },
    visualization_settings: {
      "table.columns": [
        { name: "question_id", enabled: true },
        { name: "recipients", enabled: true },
        { name: "type", enabled: true },
        { name: "collection", enabled: true },
        { name: "frequency", enabled: true },
        {
          name: "last_sent",
          enabled: true,
          date_format: "M/D/YYYY",
        },
        { name: "created_by", enabled: true },
        {
          name: "created_at",
          enabled: true,
          date_format: "M/D/YYYY",
        },
      ],
    },
  },
});
