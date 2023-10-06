Cypress.Commands.add(
  "addSQLiteDatabase",
  ({ name = "sqlite", auto_run_queries = true, is_full_sync = true } = {}) => {
    cy.log(`Add SQLite database DB called "${name}"`);
    cy.request("POST", "/api/database", {
      engine: "sqlite",
      name,
      details: { db: "./resources/sqlite-fixture.db" },
      auto_run_queries,
      is_full_sync,
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
  },
);
