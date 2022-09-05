Cypress.Commands.add(
  "addH2SampleDatabase",
  ({ name, auto_run_queries = false, is_full_sync = false } = {}) => {
    // IMPORTANT!
    // TODO: Remove the following line when https://github.com/metabase/metabase/issues/24900 gets fixed.
    cy.skipOn(true);
    cy.log(`Add another H2 sample database DB called "${name}"`);
    cy.request("POST", "/api/database", {
      engine: "h2",
      name,
      details: {
        db: "zip:./target/uberjar/metabase.jar!/sample-database.db;USER=GUEST;PASSWORD=guest",
      },
      auto_run_queries,
      is_full_sync,
      schedules: {},
    });
  },
);
