import {
  restore,
  modal,
  openNativeEditor,
  saveQuestion,
} from "e2e/support/helpers";

describe("issue 14957", { tags: "@external" }, () => {
  const PG_DB_NAME = "QA Postgres12";

  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should save a question before query has been executed (metabase#14957)", () => {
    openNativeEditor({ databaseName: PG_DB_NAME }).type("select pg_sleep(60)");

    saveQuestion("14957");
    modal().should("not.exist");
  });
});
