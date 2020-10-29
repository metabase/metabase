/* @flow */

export const viewsByTime = (questionId: number) => ({
  card: {
    name: "Views per day",
    display: "line",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.question-detail/views-by-time",
      args: [questionId, "day"], // FIXME: should this be automatic?
    },
  },
});

export const revisionHistory = (questionId: number) => ({
  card: {
    name: "Revision history",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.question-detail/revision-history",
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

export const auditLog = (questionId: number) => ({
  card: {
    name: "Audit log",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.question-detail/audit-log",
      args: [questionId],
    },
    visualization_settings: {
      "table.columns": [
        { name: "user_id", enabled: true },
        { name: "when", enabled: true },
      ],
    },
  },
});
