import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  entityPickerModal,
  restore,
  startNewQuestion,
  enterCustomColumnDetails,
  visualize,
  popover,
  resetTestTable,
  tableHeaderClick,
} from "e2e/support/helpers";

["postgres", "mysql"].forEach(dialect => {
  describe(`issue 27745 (${dialect})`, { tags: "@external" }, () => {
    const tableName = "colors27745";

    beforeEach(() => {
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();

      resetTestTable({ type: dialect, table: tableName });
      cy.request("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`);
    });

    it("should display all summarize options if the only numeric field is a custom column (metabase#27745)", () => {
      startNewQuestion();

      entityPickerModal().within(() => {
        cy.findByPlaceholderText("Search…").type("colors");
        cy.findByTestId("result-item")
          .contains(/colors/i)
          .click();
      });
      cy.icon("add_data").click();
      enterCustomColumnDetails({
        formula: "case([ID] > 1, 25, 5)",
        name: "Numeric",
      });
      cy.button("Done").click();

      visualize();

      tableHeaderClick("Numeric");
      popover().findByText(/^Sum$/).click();

      cy.wait("@dataset");
      cy.findByTestId("scalar-value").invoke("text").should("eq", "55");

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
