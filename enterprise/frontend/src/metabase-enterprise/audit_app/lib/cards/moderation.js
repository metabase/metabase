export const moderatorsTable = () => ({
  card: {
    name: "Moderators",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.moderators/table",
      args: [],
    },
    visualization_settings: {},
  },
});

export const moderatorGroupsTable = () => ({
  card: {
    name: "Moderator Groups",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.moderator-groups/table",
      args: [],
    },
    visualization_settings: {},
  },
});

export const moderationIssuesTable = () => ({
  card: {
    name: "Moderation Issues",
    display: "table",
    dataset_query: {
      type: "internal",
      fn: "metabase-enterprise.audit.pages.moderation-issues/table",
      args: [],
    },
    visualization_settings: {},
  },
});
