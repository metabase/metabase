export const details = (queryHash: string) => ({
  card: {
    name: "Query details",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.query-detail/details",
      args: [queryHash],
    },
  },
});
