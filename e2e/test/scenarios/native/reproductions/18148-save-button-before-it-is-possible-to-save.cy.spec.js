import { restore, openNativeEditor } from "e2e/support/helpers";

const dbName = "sqlite";

describe("issue 18148", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.addSQLiteDatabase({
      name: dbName,
    });

    openNativeEditor({ databaseName: dbName });
  });

  it("should not offer to save the question before it is actually possible to save it (metabase#18148)", () => {
    cy.findByTestId("qb-header")
      .findByText("Save")
      .should("have.attr", "aria-disabled", "true");

    cy.get(".ace_content").should("be.visible").click().type("select foo");

    cy.findByTestId("qb-header")
      .findByText("Save")
      .should("have.attr", "aria-disabled", "false")
      .click();

    cy.findByTestId("save-question-modal").findByText("Save").should("exist");
  });
});
