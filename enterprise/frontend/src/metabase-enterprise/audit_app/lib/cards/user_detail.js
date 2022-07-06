export const table = userId => ({
  card: {
    name: "Most-viewed Dashboards",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/table",
      args: [userId],
    },
  },
});

export const mostViewedDashboards = userId => ({
  card: {
    name: "Most-viewed Dashboards",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/most-viewed-dashboards",
      args: [userId],
    },
    visualization_settings: {
      "graph.dimensions": ["dashboard_id"],
      "graph.metrics": ["count"],
    },
  },
});

export const mostViewedQuestions = userId => ({
  card: {
    name: "Most-viewed Queries",
    display: "row",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/most-viewed-questions",
      args: [userId],
    },
    visualization_settings: {
      "graph.dimensions": ["card_id"],
      "graph.metrics": ["count"],
    },
  },
});

export const objectViewsByTime = userId => ({
  card: {
    name: "Query views",
    display: "line",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/object-views-by-time",
      args: [userId, "card", "day"],
    },
  },
  series: [
    {
      name: "Dashboard views",
      display: "line",
      dataset_query: {
        type: "internal",
        fn: "metabase-enterprise.audit-app.pages.user-detail/object-views-by-time",
        args: [userId, "dashboard", "day"],
      },
    },
  ],
});

export const queryViews = userId => ({
  card: {
    name: "Query views",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/query-views",
      args: [userId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "card_id", enabled: true },
        { name: "type", enabled: true },
        { name: "database_id", enabled: true },
        { name: "table_id", enabled: true },
        { name: "collection_id", enabled: true },
        { name: "viewed_on", enabled: true, date_format: "M/D/YYYY, h:mm A" },
      ],
    },
  },
});

export const dashboardViews = userId => ({
  card: {
    name: "Dashboard views",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/dashboard-views",
      args: [userId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "dashboard_id", enabled: true },
        { name: "collection_id", enabled: true },
        { name: "timestamp", enabled: true },
      ],
    },
  },
});

export const createdDashboards = userId => ({
  card: {
    name: "Created dashboards",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/created-dashboards",
      args: [userId],
    },
  },
});

export const createdQuestions = userId => ({
  card: {
    name: "Created questions",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/created-questions",
      args: [userId],
    },
  },
});

export const downloads = userId => ({
  card: {
    name: "Downloads",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.user-detail/downloads",
      args: [userId],
    },
  },
});
