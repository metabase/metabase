import { restore, openNativeEditor } from "e2e/support/helpers";

const dbName = "Sample2";

describe("issue 18148", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.addH2SampleDatabase({
      name: dbName,
    });

    openNativeEditor();
  });

  it("should not offer to save the question before it is actually possible to save it (metabase#18148)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").should("have.attr", "aria-disabled", "true");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(dbName).click();

    cy.get(".ace_content").should("be.visible").type("select foo");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.get(".Modal").should("exist");
  });
});
