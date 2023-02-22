export const viewsByTime = questionId => ({
  card: {
    name: "Views last 45 days",
    display: "bar",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.question-detail/cached-views-by-time",
      args: [questionId, "day"],
    },
    visualization_settings: {
      series_settings: {
        "cached-views": {
          title: "Cached",
          color: "#88BF4D",
        },
        "uncached-views": {
          title: "Uncached",
          color: "#EF8C8C",
        },
      },
      "graph.dimensions": ["date"],
      "graph.metrics": ["cached", "uncached"],
      "stackable.stack_type": "stacked",
      "graph.y_axis.title_text": "Views",
    },
  },
});

export const averageExecutionTime = questionId => ({
  card: {
    name: "Average execution time last 45 days",
    display: "line",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.question-detail/avg-execution-time-by-time",
      args: [questionId, "day"],
    },
  },
});

export const revisionHistory = questionId => ({
  card: {
    name: "Revision history",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.question-detail/revision-history",
      args: [questionId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "user_id", enabled: true },
        { name: "change_made", enabled: true },
        { name: "revision_id", enabled: true },
        { name: "timestamp", enabled: true, date_format: "M/D/YYYY, h:mm A" },
      ],
    },
  },
});

export const auditLog = questionId => ({
  card: {
    name: "Audit log",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit-app.pages.question-detail/audit-log",
      args: [questionId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "user_id", enabled: true },
        { name: "when", enabled: true },
        {
          name: "what",
          enabled: true,
          // This needs to combinatorially explore the metadata boolean space: if n grows above 2, replace mustache
          markdown_template: `
{{#json.ignore_cache}}Requested un-cached results{{/json.ignore_cache}}
{{^json.ignore_cache}}
{{#json.cached}}Viewed (cached){{/json.cached}}
{{^json.cached}}Viewed{{/json.cached}}
{{/json.ignore_cache}}`,
        },
      ],
    },
  },
});
