import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { restore, openTable } from "e2e/support/helpers";

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
          mode: "notebook",
        });
      });
    });

    it("should be possible to filter by Mongo _id column (metabase#42010)", () => {
      cy.get("button").contains("Visualize").click();
      cy.get("[data-testid=cell-data]")
        .eq(10)
        .then(elm => {
          // Get the id of some row and go back to notebook editor. I suppose it differs per snapshot, hence we are
          // unable to hardcode the value.
          const id = elm.text();
          cy.go("back");

          // Check the notebook editor
          cy.log("Check notebook editor");
          cy.findByRole("button", { name: "Filter" }).click();
          // Following selects first item from filter column picker
          cy.get("[data-element-id=list-item-title]")
            .eq(0)
            .should("have.text", "ID");
          cy.get("[data-element-id=list-item-title]").eq(0).click();
          cy.findByPlaceholderText("Search by ID").type(id);
          cy.get("button").contains("Add filter").click();
          cy.get("button").contains("Visualize").click();
          cy.get("button").contains("Showing 1 row");

          // Now remove the filter
          cy.log("Remove current filter");
          cy.findByRole("button", { name: "Remove" }).click();

          // And add the filter through chill mode
          cy.log("Check chill mode");
          cy.get("button").contains("Filter").click();
          cy.findByPlaceholderText("Search by ID").type(id);
          cy.get("button").contains("Apply filter").click();
          cy.get("button").contains("Showing 1 row");
        });
    });
  },
);
