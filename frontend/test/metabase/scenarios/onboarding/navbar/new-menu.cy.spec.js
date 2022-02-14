import { restore, popover, modal } from "__support__/e2e/cypress";

describe("metabase > scenarios > navbar > new menu", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/");
    cy.findByText("New").click();
  });

  it("question item opens question notebook editor", () => {
    popover().within(() => {
      cy.findByText("Question").click();
    });

    cy.url("should.contain", "/question/notebook#");
  });

  // Although the issue is related to Mongo and some other databases that don't have SQL queries,
  // this is a good spot to check that we don't use the term "SQL" even for the databases that do support it.
  it("question item opens Native query editor (metabase#20499)", () => {
    popover().within(() => {
      cy.findByText("Native query").click();
    });

    cy.url("should.contain", "/question#");
    cy.get(".ace_content");
  });

  it("collection opens modal and redirects to a created collection after saving", () => {
    popover().within(() => {
      cy.findByText("Collection").click();
    });

    modal().within(() => {
      cy.findByText("Our analytics");

      cy.findByLabelText("Name").type("Test collection");
      cy.findByLabelText("Description").type("Test collection description");

      cy.findByText("Create").click();
    });

    cy.get("h1").should("have.text", "Test collection");
  });
});
