import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  openTable,
  visualize,
  filter,
  openNotebook,
  popover,
} from "e2e/support/helpers";

describe(
  "issue 42010 -- Unable to filter by mongo id",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      restore("mongo-5");
      cy.signInAsAdmin();

      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          limit: 2,
        });
      });
    });

    it("should be possible to filter by Mongo _id column (metabase#42010)", () => {
      cy.get("#main-data-grid")
        .findAllByRole("gridcell")
        .first()
        .then($cell => {
          // Ids are non-deterministic so we have to obtain the id from the cell, and store its value.
          const id = $cell.text();

          cy.log(
            "Scenario 1 - Make sure we can filter directly by clicking on the cell",
          );
          cy.wrap($cell).click();

          cy.findByTestId("filter-pill")
            .should("contain", `ID is ${id}`)
            .click();

          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );

          // This was showing a custom expression editor before the fix!
          cy.findByTestId("string-filter-picker").within(() => {
            cy.findByLabelText("Filter operator").should("have.value", "Is");
            cy.findByText(id).should("be.visible");
          });
          removeFilter();

          cy.log(
            "Scenario 2 - Make sure the simple mode filter is working correctly",
          );
          filter();

          cy.findByRole("dialog").within(() => {
            cy.findByPlaceholderText("Search by ID").type(id);
            cy.button("Apply filters").click();
          });

          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
          removeFilter();

          cy.log(
            "Scenario 3 - Make sure filter is working in the notebook editor",
          );
          openNotebook();
          filter({ mode: "notebook" });

          popover()
            .findAllByRole("option")
            .first()
            .should("have.text", "ID")
            .click();

          cy.findByTestId("string-filter-picker").within(() => {
            cy.findByLabelText("Filter operator").should("have.value", "Is");
            cy.findByPlaceholderText("Search by ID").type(id);
            cy.button("Add filter").click();
          });

          cy.findByTestId("step-filter-0-0").within(() => {
            cy.findByText(`ID is ${id}`);

            cy.log(
              "Scenario 3.1 - Trigger the preview to make sure it reflects the filter correctly",
            );
            cy.icon("play").click();
          });

          cy.findByTestId("preview-root")
            .should("contain", id) // first row
            .and("not.contain", "110.93"); // second row

          cy.log("Scenario 3.2 - Make sure we can visualize the data");
          visualize();
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
        });
    });
  },
);

function removeFilter() {
  cy.findByTestId("filter-pill").findByLabelText("Remove").click();
  cy.findByTestId("question-row-count").should("have.text", "Showing 2 rows");
}
