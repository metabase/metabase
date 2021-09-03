// export const subscriptions = dashboardName => ({
//   card: {
//     name: "Subscriptions",
//     display: "table",
//     dataset_query: {
//       type: "internal",
//       fn: "metabase-enterprise.audit.pages.subscriptions/subscriptions-table",
//       args: [dashboardName],
//     },
//     visualization_settings: {
//       "table.columns": [
//         { name: "dashboard_id", enabled: true },
//         { name: "recipients", enabled: true },
//         { name: "type", enabled: true },
//         { name: "collection", enabled: true },
//         { name: "frequency", enabled: true },
//         {
//           name: "last_sent",
//           enabled: true,
//           date_format: "M/D/YYYY",
//         },
//         { name: "created_by", enabled: true },
//         {
//           name: "created_at",
//           enabled: true,
//           date_format: "M/D/YYYY",
//         },
//         {
//           name: "filters",
//           enabled: true,
//         },
//       ],
//     },
//   },
// });

export const alerts = questionName => ({
  card: {
    name: "Alerts",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.subscriptions/alerts-table",
      args: [questionName],
    },
    visualization_settings: {
      "table.columns": [
        { name: "question_id", enabled: true },
        { name: "recipients", enabled: true },
        { name: "type", enabled: true },
        { name: "collection", enabled: true },
        { name: "frequency", enabled: true },
        {
          name: "last_sent",
          enabled: true,
          date_format: "M/D/YYYY",
        },
        { name: "created_by", enabled: true },
        {
          name: "created_at",
          enabled: true,
          date_format: "M/D/YYYY",
        },
      ],
    },
  },
});

// Temporary use a different query until BE is ready
export const subscriptions = () => ({
  card: {
    name: "Dashboards",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.dashboards/table",
      args: [],
    },
    visualization_settings: {
      "table.columns": [
        { name: "dashboard_id", enabled: true },
        { name: "total_views", enabled: true },
        { name: "average_execution_time_ms", enabled: true },
        { name: "cards", enabled: true },
        { name: "saved_by_id", enabled: true },
        {
          name: "public_link",
          enabled: true,
          markdown_template: "[Link]({{value}})",
        },
        { name: "saved_on", enabled: true, date_format: "M/D/YYYY, h:mm A" },
        {
          name: "last_edited_on",
          enabled: true,
          date_format: "M/D/YYYY, h:mm A",
        },
      ],
    },
  },
});
