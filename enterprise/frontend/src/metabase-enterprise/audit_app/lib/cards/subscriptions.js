export const table = () => ({
  card: {
    name: "Subscriptions",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.dashboard-subscriptions/table",
      args: [],
    },
    visualization_settings: {
      "table.columns": [
        { name: "dashboard_id", enabled: true },
        { name: "pulse_id", enabled: false },
        { name: "recipients", enabled: true },
        { name: "subscription_type", enabled: true },
        { name: "collection_id", enabled: true },
        { name: "frequency", enabled: true },
        { name: "creator_id", enabled: true },
        {
          name: "created_at",
          enabled: true,
          date_format: "M/D/YYYY",
        },
        {
          name: "num_filters",
          enabled: true,
        },
      ],
    },
  },
});
