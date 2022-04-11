import { restore, modal, openNativeEditor } from "__support__/e2e/cypress";

const PG_DB_NAME = "QA Postgres12";

export function issue14957() {
  describe.skip("issue 14957", () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();
    });

    it("should save a question before query has been executed (metabase#14957)", () => {
      openNativeEditor({ databaseName: PG_DB_NAME }).type(
        "select pg_sleep(60)",
      );

      cy.findByText("Save").click();

      cy.findByLabelText("Name").type("14957");
      cy.button("Save").click();

      modal().should("not.exist");
    });
  });
}
