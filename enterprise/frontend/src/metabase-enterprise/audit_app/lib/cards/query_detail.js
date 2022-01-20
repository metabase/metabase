export const details = queryHash => ({
  card: {
    name: "Query details",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.query-detail/details",
      args: [queryHash],
    },
  },
});
