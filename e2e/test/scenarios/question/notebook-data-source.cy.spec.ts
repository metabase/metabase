import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { popover, restore } from "e2e/support/helpers";

describe("scenarios > notebook > data source", () => {
  describe("empty app db", () => {
    beforeEach(() => {
      restore("setup");
      cy.signInAsAdmin();
    });

    it("should display tables from the only existing database by default", () => {
      cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/*`).as("dbSchema");

      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByTextEnsureVisible("Question").click();
      cy.wait("@dbSchema");

      popover().within(() => {
        cy.findByTestId("source-database").should(
          "have.text",
          "Sample Database",
        );
        cy.findAllByRole("option")
          .should("have.length", 8)
          .each(table => {
            cy.wrap(table).should("have.attr", "aria-selected", "false");
          });
      });
    });
  });
});
