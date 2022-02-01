import {
  restore,
  openOrdersTable,
  popover,
  getAddDimensionButton,
} from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > question > view", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

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
      cy.findByText("Done").click();

      cy.contains("Count by Created At: Month");

      // Go back into sidebar
      cy.contains("Summarize").click();

      // change grouping from month to year
      cy.contains("Summarize by")
        .parent()
        .parent()
        .as("sidebar");
      cy.get("@sidebar")
        .contains("by month")
        .click();
      cy.get(".PopoverBody")
        .contains("Year")
        .click();

      cy.contains("Count by Created At: Year");

      getAddDimensionButton({ name: "Category" }).click();

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
      cy.findByPlaceholderText("Search by Vendor")
        .clear()
        .type("A");
      cy.findByText("Alfreda Konopelski II Group").click();

      cy.contains("Add filter").click();
      cy.contains("Showing 91 rows");
    });

    // flaky test (#19454)
    it.skip("should show info popover for dimension in the filter list", () => {
      openOrdersTable();
      cy.contains("Filter").click();

      cy.contains("Name").trigger("mouseenter");
      popover().contains("Name");
      popover().contains("2,499 distinct values");
    });
  });

  describe("apply filters without data permissions", () => {
    beforeEach(() => {
      // All users upgraded to collection view access
      cy.visit("/admin/permissions/collections/root");
      cy.icon("close")
        .first()
        .click();
      cy.findAllByRole("option")
        .contains("View")
        .click();
      cy.findByText("Save changes").click();
      cy.findByText("Yes").click();

      // Native query saved in dasbhoard
      cy.createDashboard();

      cy.createNativeQuestion({
        name: "Question",
        native: {
          query: "select * from products where {{category}} and {{vendor}}",
          "template-tags": {
            category: {
              id: "6b8b10ef-0104-1047-1e5v-2492d5954555",
              name: "category",
              "display-name": "CATEGORY",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "id",
            },
            vendor: {
              id: "6b8b10ef-0104-1047-1e5v-2492d5964545",
              name: "vendor",
              "display-name": "VENDOR",
              type: "dimension",
              dimension: ["field", PRODUCTS.VENDOR, null],
              "widget-type": "id",
            },
          },
        },
      });

      cy.request("POST", "/api/dashboard/2/cards", {
        id: 2,
        cardId: 4,
      });
    });

    it("should show filters by search for Vendor", () => {
      cy.visit("/question/4");

      cy.findAllByText("VENDOR")
        .first()
        .click();
      popover().within(() => {
        cy.findByPlaceholderText("Search by Vendor");
        cy.findByText("Search the list").should("not.exist");
      });
    });

    it("should be able to filter Q by Category as no data user (from Q link) (metabase#12654)", () => {
      cy.signIn("nodata");
      cy.visit("/question/4");

      // Filter by category and vendor
      // TODO: this should show values and allow searching
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR")
        .first()
        .click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text").type("Balistreri-Muller");
        cy.findByText("Add filter").click();
      });
      cy.findAllByText("CATEGORY")
        .first()
        .click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text").type("Widget");
        cy.findByText("Add filter").click();
      });

      cy.get(".RunButton")
        .last()
        .click();

      cy.findAllByText("Widget");
      cy.findAllByText("Gizmo").should("not.exist");
    });

    it("should be able to filter Q by Vendor as user (from Dashboard) (metabase#12654)", () => {
      // Navigate to Q from Dashboard
      cy.signIn("nodata");
      cy.visit("/dashboard/2");
      cy.findByText("Question").click();

      // Filter by category and vendor
      // TODO: this should show values and allow searching
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR")
        .first()
        .click();
      popover().within(() => {
        cy.findByPlaceholderText("Search by Vendor")
          .focus()
          .clear()
          .type("Balistreri-Muller");
        cy.findByText("Add filter").click();
      });
      cy.get(".RunButton")
        .first()
        .click();
      cy.findAllByText("CATEGORY")
        .first()
        .click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text")
          .click()
          .clear()
          .type("Widget");
        cy.findByText("Add filter").click();
      });
      cy.get(".RunButton")
        .last()
        .click();

      cy.get(".TableInteractive-cellWrapper--firstColumn").should(
        "have.length",
        2,
      );
      cy.get(".CardVisualization").within(() => {
        cy.findByText("Widget");
        cy.findByText("Balistreri-Muller");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("McClure-Lockman").should("not.exist");
      });
    });
  });
});
