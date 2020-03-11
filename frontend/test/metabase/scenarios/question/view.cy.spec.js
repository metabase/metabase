import { signInAsAdmin, restore, openOrdersTable } from "__support__/cypress";

describe("scenarios > question > view", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  describe("summarize sidebar", () => {
    it("should summarize by category and show a bar chart", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
      openOrdersTable();
      cy.wait("@dataset");
      cy.contains("Summarize").click();
      cy.contains("Category").click();
      cy.contains("Done").click();
      cy.contains("Count by Product → Category");
    });

    it("should show orders by year and product category", () => {
      openOrdersTable();
      cy.contains("Showing first 2,000 rows");
      cy.contains("Summarize").click();

      // alias @sidebar so we can more easily click dimensions
      cy.contains("Summarize by")
        .parent()
        .parent()
        .as("sidebar");

      cy.get("@sidebar")
        .contains("Created At")
        .click();

      cy.contains("Count by Created At: Month");

      // change grouping from month to year
      cy.get("@sidebar")
        .contains("by month")
        .click();
      cy.get(".PopoverBody")
        .contains("Year")
        .click();

      cy.contains("Count by Created At: Year");

      cy.get("@sidebar")
        .contains("Category")
        .parent()
        .parent()
        .find(".Field-extra .Icon")
        .click({ force: true }); // we need to force this because it only displays on hover

      cy.contains("Done").click();

      // check for title, legend, and x axis labels
      cy.contains("Count by Created At: Year and Product → Category");
      ["2016", "2017", "2018", "2019", "2020"].forEach(l => cy.contains(l));
      ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach(l => cy.contains(l));
    });
  });

  describe("filter sidebar", () => {
    it("should filter a table", () => {
      openOrdersTable();
      cy.contains("Filter").click();
      cy.contains("Vendor").click();
      cy.get("input[placeholder='Search by Vendor']")
        .clear()
        .type("Alfreda Konopelski II Group")
        .blur();
      cy.contains("Add filter").click();
      cy.contains("Showing 91 rows");
    });
  });
});
