export const perDayBySize = () => ({
  card: {
    name: "Largest downloads in the last 30 days",
    display: "scatter",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.downloads/per-day-by-size",
      args: [],
    },
    visualization_settings: {
      "graph.dimensions": ["date"],
      "graph.metrics": ["rows"],
      "scatter.bubble": null,
    },
  },
});

export const perUser = () => ({
  card: {
    name: "Total downloads per user",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.downloads/per-user",
      args: [],
    },
    visualization_settings: {
      "graph.dimensions": ["user_id"],
      "graph.metrics": ["downloads"],
    },
  },
});

export const bySize = () => ({
  card: {
    name: "All downloads by size",
    display: "bar",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.downloads/by-size",
      args: [],
    },
  },
});

export const table = () => ({
  card: {
    name: "Downloads",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.downloads/table",
      args: [],
    },
  },
});
