export const table = () => ({
  card: {
    name: "Alerts",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.subscriptions/alerts-table",
      args: [],
    },
  },
});
