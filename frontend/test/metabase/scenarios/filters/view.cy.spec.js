import {
  restore,
  popover,
  visitQuestion,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > question > view", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("apply filters without data permissions", () => {
    beforeEach(() => {
      // All users upgraded to collection view access
      cy.visit("/admin/permissions/collections/root");
      cy.icon("close").first().click();
      cy.findAllByRole("option").contains("View").click();
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
      visitQuestion(4);

      cy.findAllByText("VENDOR").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Search the list");
        cy.findByText("Search the list").should("not.exist");
      });
    });

    it("should be able to filter Q by Category as no data user (from Q link) (metabase#12654)", () => {
      cy.signIn("nodata");
      visitQuestion(4);

      // Filter by category and vendor
      // TODO: this should show values and allow searching
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text").type("Balistreri-Muller");
        cy.findByText("Add filter").click();
      });
      cy.findAllByText("CATEGORY").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text").type("Widget");
        cy.findByText("Add filter").click();
      });

      cy.get(".RunButton").last().click();

      cy.findAllByText("Widget");
      cy.findAllByText("Gizmo").should("not.exist");
    });

    it("should be able to filter Q by Vendor as user (from Dashboard) (metabase#12654)", () => {
      // Navigate to Q from Dashboard
      cy.signIn("nodata");
      visitDashboard(2);
      cy.findByText("Question").click();

      // Filter by category and vendor
      // TODO: this should show values and allow searching
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text")
          .focus()
          .clear()
          .type("Balistreri-Muller");
        cy.findByText("Add filter").click();
      });
      cy.get(".RunButton").first().click();
      cy.findAllByText("CATEGORY").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text")
          .click()
          .clear()
          .type("Widget");
        cy.findByText("Add filter").click();
      });
      cy.get(".RunButton").last().click();

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
