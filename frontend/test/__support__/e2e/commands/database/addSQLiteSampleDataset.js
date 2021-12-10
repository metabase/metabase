Cypress.Commands.add("addSQLiteSampleDataset", ({ name } = {}) => {
  cy.log(`Add SQLite sample dataset DB called "${name}"`);
  cy.request("POST", "/api/database", {
    engine: "sqlite",
    name: "sqlite",
    details: { db: "./resources/sqlite-fixture.db" },
    auto_run_queries: true,
    is_full_sync: true,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  });
});
