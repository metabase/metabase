export const mostQueried = () => ({
  card: {
    name: "Most-queried schemas",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.schemas/most-queried",
      args: [],
    },
  },
});

export const slowestSchemas = () => ({
  card: {
    name: "Slowest schemas",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.schemas/slowest-schemas",
      args: [],
    },
  },
});

export const table = (searchString?: string) => ({
  card: {
    name: "Schemas",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.schemas/table",
      args: searchString ? [searchString] : [],
    },
  },
});
