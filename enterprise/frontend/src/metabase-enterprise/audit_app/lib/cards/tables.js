export const mostQueried = () => ({
  card: {
    name: "Most-queried tables",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.tables/most-queried",
      args: [],
    },
    visualization_settings: {
      "graph.dimensions": ["table_id"],
      "graph.metrics": ["executions"],
    },
  },
});

export const leastQueried = () => ({
  card: {
    name: "Least-queried tables",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.tables/least-queried",
      args: [],
    },
    visualization_settings: {
      "graph.dimensions": ["table_id"],
      "graph.metrics": ["executions"],
    },
  },
});

export const table = (searchString?: string) => ({
  card: {
    name: "Tables",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.tables/table",
      args: searchString ? [searchString] : [],
    },
  },
});
