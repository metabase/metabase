import {
  restore,
  snapshot,
  addPostgresDatabase,
  addMongoDatabase,
  addMySQLDatabase,
} from "e2e/support/helpers";

describe("qa databases snapshots", { tags: "@external" }, () => {
  beforeEach(() => {
    restoreAndAuthenticate();
  });

  it("creates snapshots for supported qa databases", () => {
    if (Cypress.env("QA_DB_MONGO") === true) {
      addMongoDatabase();
      snapshot("mongo-4");
      deleteDatabase("mongoID");

      restoreAndAuthenticate();
    } else {
      addPostgresDatabase();
      snapshot("postgres-12");
      deleteDatabase("postgresID");

      restoreAndAuthenticate();

      addMySQLDatabase();
      snapshot("mysql-8");
      deleteDatabase("mysqlID");
    }

    restore("blank");
  });
});

function restoreAndAuthenticate() {
  restore("default");
  cy.signInAsAdmin();
}

function deleteDatabase(idAlias) {
  cy.get("@" + idAlias).then(id => {
    return cy.request("DELETE", `/api/database/${id}`);
  });
}
