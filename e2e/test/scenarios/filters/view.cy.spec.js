import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  visitQuestion,
  visitDashboard,
  addOrUpdateDashboardCard,
} from "e2e/support/helpers";

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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save changes").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Yes").click();

      // Native query saved in dasbhoard
      cy.createDashboard({}, { wrapId: true });

      cy.createNativeQuestion(
        {
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
                "widget-type": "string/=",
              },
              vendor: {
                id: "6b8b10ef-0104-1047-1e5v-2492d5964545",
                name: "vendor",
                "display-name": "VENDOR",
                type: "dimension",
                dimension: ["field", PRODUCTS.VENDOR, null],
                "widget-type": "string/=",
              },
            },
          },
        },
        { wrapId: true },
      );

      cy.get("@questionId").then(questionId => {
        cy.get("@dashboardId").then(dashboardId => {
          addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: questionId,
          });
        });
      });
    });

    it("should show filters by search for Vendor", () => {
      visitQuestion("@questionId");

      cy.findAllByText("VENDOR").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Search the list");
        cy.findByText("Search the list").should("not.exist");
      });
    });

    it("should be able to filter Q by Category as no data user (from Q link) (metabase#12654)", () => {
      cy.signIn("nodata");
      visitQuestion("@questionId");

      // Filter by category and vendor
      // TODO: this should show values and allow searching
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

      cy.findAllByTestId("run-button").last().click();

      cy.findAllByText("Widget");
      cy.findAllByText("Gizmo").should("not.exist");
    });

    it("should be able to filter Q by Vendor as user (from Dashboard) (metabase#12654)", () => {
      // Navigate to Q from Dashboard
      cy.signIn("nodata");
      visitDashboard("@dashboardId");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question").click();

      // Filter by category and vendor
      // TODO: this should show values and allow searching
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text")
          .focus()
          .clear()
          .type("Balistreri-Muller");
        cy.findByText("Add filter").click();
      });
      cy.findAllByTestId("run-button").first().click();
      cy.findAllByText("CATEGORY").first().click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text")
          .click()
          .clear()
          .type("Widget");
        cy.findByText("Add filter").click();
      });
      cy.findAllByTestId("run-button").last().click();

      cy.get(".test-TableInteractive-cellWrapper--firstColumn").should(
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
