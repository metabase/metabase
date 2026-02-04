const e2eMatrixMap = [
  {
    specFolder: "actions",
    globs: [
      "frontend/src/metabase/actions/**",
      "src/metabase/actions/**",
    ],
  },
  {
    specFolder: "admin",
    globs: [
      "frontend/src/metabase/admin/**",
      "src/metabase/settings/**",
      "src/metabase/settings_rest/**",
      "src/metabase/api/database.clj",
      "src/metabase/api/user.clj",
    ],
  },
  {
    specFolder: "admin-2",
    globs: [
      "frontend/src/metabase/admin/**",
      "src/metabase/settings/**",
      "src/metabase/settings_rest/**",
      "src/metabase/api/database.clj",
      "src/metabase/api/user.clj",
    ],
  },
  {
    specFolder: "binning",
    globs: [
      "frontend/src/metabase/query_builder/**",
      "src/metabase/query_processor/**",
      "src/metabase/lib/**",
    ],
  },
  {
    specFolder: "collections",
    globs: [
      "frontend/src/metabase/collections/**",
      "src/metabase/collections/**",
      "src/metabase/collections_rest/**",
      "src/metabase/api/collection.clj",
    ],
  },
  {
    specFolder: "custom-column",
    globs: [
      "frontend/src/metabase/query_builder/**",
      "src/metabase/query_processor/**",
      "src/metabase/lib/**",
    ],
  },
  {
    specFolder: "dashboard",
    globs: [
      "frontend/src/metabase/dashboard/**",
      "src/metabase/dashboards/**",
      "src/metabase/dashboards_rest/**",
      "src/metabase/api/dashboard.clj",
    ],
  },
  {
    specFolder: "dashboard-cards",
    globs: [
      "frontend/src/metabase/dashboard/**",
      "src/metabase/dashboards/**",
      "src/metabase/dashboards_rest/**",
      "src/metabase/api/dashboard.clj",
      "src/metabase/api/card.clj",
    ],
  },
  {
    specFolder: "dashboard-filters",
    globs: [
      "frontend/src/metabase/dashboard/**",
      "frontend/src/metabase/parameters/**",
      "src/metabase/dashboards/**",
      "src/metabase/parameters/**",
      "src/metabase/api/dashboard.clj",
    ],
  },
  {
    specFolder: "dashboard-filters-2",
    globs: [
      "frontend/src/metabase/dashboard/**",
      "frontend/src/metabase/parameters/**",
      "src/metabase/dashboards/**",
      "src/metabase/parameters/**",
    ],
  },
  {
    specFolder: "dashboard-filters-matrix",
    globs: [
      "frontend/src/metabase/dashboard/**",
      "frontend/src/metabase/parameters/**",
      "src/metabase/dashboards/**",
      "src/metabase/parameters/**",
    ],
  },
  {
    specFolder: "data-model",
    globs: [
      "frontend/src/metabase/admin/**",
      "frontend/src/metabase-lib/**",
      "src/metabase/models/**",
      "src/metabase/api/field.clj",
      "src/metabase/api/table.clj",
    ],
  },
  {
    specFolder: "data-reference",
    globs: [
      "frontend/src/metabase/reference/**",
      "src/metabase/api/database.clj",
      "src/metabase/api/table.clj",
      "src/metabase/api/field.clj",
    ],
  },
  {
    specFolder: "data-studio",
    globs: [
      "frontend/src/metabase/data-studio/**",
      "frontend/src/metabase/query_builder/**",
      "frontend/src/metabase/querying/**",
      "src/metabase/query_processor/**",
      "src/metabase/lib/**",
    ],
  },
  {
    specFolder: "dependencies",
    globs: [
      "package.json",
      "yarn.lock",
    ],
  },
  {
    specFolder: "detail-view",
    globs: [
      "frontend/src/metabase/detail-view/**",
      "src/metabase/query_processor/**",
    ],
  },
  {
    specFolder: "docker-compose.yml",
    globs: [
      "dev/docker-compose.yml",
    ],
  },
  {
    specFolder: "documents",
    globs: [
      "frontend/src/metabase/documents/**",
      "src/metabase/documents/**",
      "src/metabase/api/document.clj",
    ],
  },
  {
    specFolder: "embedding",
    globs: [
      "frontend/src/metabase/embedding/**",
      "frontend/src/metabase/public/**",
      "src/metabase/embedding/**",
      "src/metabase/embedding_rest/**",
      "src/metabase/public_sharing/**",
      "src/metabase/public_sharing_rest/**",
      "src/metabase/api/embed.clj",
      "src/metabase/api/public.clj",
    ],
  },
  {
    specFolder: "filters",
    globs: [
      "frontend/src/metabase/parameters/**",
      "frontend/src/metabase/query_builder/**",
      "src/metabase/parameters/**",
      "src/metabase/query_processor/**",
    ],
  },
  {
    specFolder: "filters-reproductions",
    globs: [
      "frontend/src/metabase/parameters/**",
      "frontend/src/metabase/query_builder/**",
      "src/metabase/parameters/**",
      "src/metabase/query_processor/**",
    ],
  },
  {
    specFolder: "i18n",
    globs: [
      "frontend/src/metabase/i18n/**",
      "locales/**",
    ],
  },
  {
    specFolder: "joins",
    globs: [
      "frontend/src/metabase/query_builder/**",
      "src/metabase/query_processor/**",
      "src/metabase/lib/**",
    ],
  },
  {
    specFolder: "maildev-keys",
    globs: [
      "dev/**",
    ],
  },
  {
    specFolder: "metabot",
    globs: [
      "frontend/src/metabase/metabot/**",
      "src/metabase/llm/**",
      "src/metabase/api/metabot.clj",
    ],
  },
  {
    specFolder: "metrics",
    globs: [
      "frontend/src/metabase/admin/**",
      "frontend/src/metabase/query_builder/**",
      "src/metabase/models/**",
      "src/metabase/measures/**",
      "src/metabase/api/metric.clj",
    ],
  },
  {
    specFolder: "models",
    globs: [
      "frontend/src/metabase/models/**",
      "frontend/src/metabase/query_builder/**",
      "src/metabase/models/**",
      "src/metabase/api/card.clj",
    ],
  },
  {
    specFolder: "native",
    globs: [
      "frontend/src/metabase/query_builder/**",
      "src/metabase/query_processor/**",
      "src/metabase/driver/**",
    ],
  },
  {
    specFolder: "native-filters",
    globs: [
      "frontend/src/metabase/parameters/**",
      "frontend/src/metabase/query_builder/**",
      "src/metabase/parameters/**",
      "src/metabase/query_processor/**",
      "src/metabase/native_query_snippets/**",
    ],
  },
  {
    specFolder: "navigation",
    globs: [
      "frontend/src/metabase/nav/**",
      "frontend/src/metabase/home/**",
      "frontend/src/metabase/browse/**",
    ],
  },
  {
    specFolder: "onboarding",
    globs: [
      "frontend/src/metabase/setup/**",
      "src/metabase/setup/**",
      "src/metabase/setup_rest/**",
    ],
  },
  {
    specFolder: "organization",
    globs: [
      "frontend/src/metabase/browse/**",
      "frontend/src/metabase/collections/**",
      "src/metabase/collections/**",
    ],
  },
  {
    specFolder: "permissions",
    globs: [
      "frontend/src/metabase/admin/**",
      "src/metabase/permissions/**",
      "src/metabase/permissions_rest/**",
      "src/metabase/api/permissions.clj",
    ],
  },
  {
    specFolder: "question",
    globs: [
      "frontend/src/metabase/query_builder/**",
      "frontend/src/metabase/questions/**",
      "src/metabase/query_processor/**",
      "src/metabase/api/card.clj",
    ],
  },
  {
    specFolder: "question-reproductions",
    globs: [
      "frontend/src/metabase/query_builder/**",
      "src/metabase/query_processor/**",
    ],
  },
  {
    specFolder: "search",
    globs: [
      "frontend/src/metabase/search/**",
      "src/metabase/search/**",
      "src/metabase/api/search.clj",
    ],
  },
  {
    specFolder: "sharing",
    globs: [
      "frontend/src/metabase/public/**",
      "frontend/src/metabase/dashboard/**",
      "src/metabase/public_sharing/**",
      "src/metabase/public_sharing_rest/**",
      "src/metabase/pulse/**",
      "src/metabase/api/public.clj",
    ],
  },
  {
    specFolder: "stats",
    globs: [
      "src/metabase/internal_stats/**",
      "src/metabase/analytics/**",
    ],
  },
  {
    specFolder: "table-editing",
    globs: [
      "frontend/src/metabase/admin/**",
      "src/metabase/api/table.clj",
      "src/metabase/api/field.clj",
    ],
  },
  {
    specFolder: "visualizations-charts",
    globs: [
      "frontend/src/metabase/visualizations/**",
      "src/metabase/query_processor/**",
    ],
  },
  {
    specFolder: "visualizations-tabular",
    globs: [
      "frontend/src/metabase/visualizations/**",
      "src/metabase/query_processor/**",
    ],
  },
  {
    // run all e2e tests if anything in these folders change
    specFolder: "**",
    globs: [
      "e2e/support/**",
      "frontend/src/metabase/*",
      "src/metabase/core/**",
      "src/metabase/server/**",
      "src/metabase/api_routes/**",
      "src/metabase/driver.clj",
      "src/metabase/config/**",
      "src/metabase/plugins/**",
      "rspack.config.js",
      "jest.config.js",
      "cypress.env.json",
    ]
  }
];

module.exports = {
  e2eMatrixMap,
};
