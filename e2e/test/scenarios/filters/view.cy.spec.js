const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > question > view", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("apply filters without data permissions", () => {
    beforeEach(() => {
      // All users upgraded to collection view access
      cy.visit("/admin/permissions/collections/root");
      cy.icon("close").first().click();
      cy.findAllByRole("option").contains("View").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save changes").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Yes").click();

      // Native query saved in dasbhoard
      H.createDashboard({}, { wrapId: true });

      H.createNativeQuestion(
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

      cy.get("@questionId").then((questionId) => {
        cy.get("@dashboardId").then((dashboardId) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: questionId,
          });
        });
      });
    });

    it("should show filters by search for Vendor", () => {
      H.visitQuestion("@questionId");

      cy.findAllByText("VENDOR").first().click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Search the list");
        cy.findByText("Search the list").should("not.exist");
      });
    });

    it("should be able to filter Q by Category as no data user (from Q link) (metabase#12654)", () => {
      cy.signIn("nodata");
      H.visitQuestion("@questionId");

      // The nodata user has view-data permission (via All Users group) but no create-queries permission.
      // With param_fields hydration, field filter widgets now show as dropdowns with values.
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR").first().click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Search the list").type("Balistreri-Muller");
        cy.findByText("Balistreri-Muller").click();
        cy.findByText("Add filter").click();
      });
      cy.findAllByText("CATEGORY").first().click();
      H.popover().within(() => {
        cy.findByText("Widget").click();
        cy.findByText("Add filter").click();
      });

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("run-button").last().click();

      cy.findAllByText("Widget");
      cy.findAllByText("Gizmo").should("not.exist");
    });

    it("should be able to filter Q by Vendor as user (from Dashboard) (metabase#12654)", () => {
      // Navigate to Q from Dashboard
      cy.signIn("nodata");
      H.visitDashboard("@dashboardId");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question").click();

      // The nodata user has view-data permission (via All Users group) but no create-queries
      // permission. The dashboard load populates field metadata into the entity cache via
      // addFields, so field filter widgets show as dropdowns when navigating to the question.
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("This question is written in SQL.");
      cy.findAllByText("VENDOR").first().click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Search the list").type("Balistreri-Muller");
        cy.findByText("Balistreri-Muller").click();
        cy.findByText("Add filter").click();
      });
      cy.findAllByText("CATEGORY").first().click();
      H.popover().within(() => {
        cy.findByText("Widget").click();
        cy.findByText("Add filter").click();
      });

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("run-button").last().click();

      cy.get(".test-TableInteractive-cellWrapper--firstColumn").should(
        "have.length",
        1,
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
