import {
  restore,
  startNewQuestion,
  enterCustomColumnDetails,
  visualize,
  popover,
  resetTestTable,
} from "e2e/support/helpers";

["postgres", "mysql"].forEach(dialect => {
  describe(`issue 27745 (${dialect})`, { tags: "@external" }, () => {
    const tableName = "colors27745";

    beforeEach(() => {
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();

      resetTestTable({ type: dialect, table: tableName });
      cy.request("POST", "/api/database/2/sync_schema");
    });

    it("should display all summarize options if the only numeric field is a custom column (metabase#27745)", () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Writable/i).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/colors/i).click();
      cy.icon("add_data").click();
      enterCustomColumnDetails({
        formula: "case([ID] > 1, 25, 5)",
        name: "Numeric",
      });
      cy.button("Done").click();

      visualize();

      cy.findAllByTestId("header-cell").contains("Numeric").click();
      popover().findByText(/^Sum$/).click();

      cy.wait("@dataset");
      cy.get(".ScalarValue").invoke("text").should("eq", "55");

      cy.findByTestId("sidebar-right")
        .should("be.visible")
        .within(() => {
          cy.findByTestId("aggregation-item").should(
            "contain",
            "Sum of Numeric",
          );
        });
    });
  });
});
