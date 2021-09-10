export const table = () => ({
  card: {
    name: "Subscriptions",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.dashboard-subscriptions/table",
      args: [],
    },
  },
});
