const { H } = cy;
import {
  EditableDashboard,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { createMockParameter } from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

// In .github/workflows/embedding-sdk-component-tests.yml, we run tests
// across multiple React versions, including React 19.
describe("scenarios > embedding-sdk > React 19 crash regression tests", () => {
  describe("Filter edit modal should not crash (EMB-1171)", () => {
    const categoryParameter = createMockParameter({
      id: "category-param",
      name: "Category",
      type: "string/=",
      slug: "category",
      sectionId: "string",
    });

    const vendorParameter = createMockParameter({
      id: "vendor-param",
      name: "Vendor",
      type: "string/=",
      slug: "vendor",
      sectionId: "string",
    });

    const priceParameter = createMockParameter({
      id: "price-param",
      name: "Price",
      type: "number/between",
      slug: "price",
      sectionId: "number",
    });

    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      H.createQuestion({
        name: "Products Question",
        query: {
          "source-table": PRODUCTS_ID,
          limit: 10,
        },
      }).then(({ body: card }) => {
        cy.wrap(card.id).as("questionId");
      });

      cy.get<number>("@questionId").then((questionId) => {
        H.createDashboard({
          name: "Dashboard with Filters",
          parameters: [categoryParameter, vendorParameter, priceParameter],
        }).then(({ body: dashboard }) => {
          cy.wrap(dashboard.id).as("dashboardId");

          // Add the question to the dashboard with parameter mappings
          H.updateDashboardCards({
            dashboard_id: dashboard.id,
            cards: [
              {
                id: -1,
                card_id: questionId,
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 8,
                parameter_mappings: [
                  {
                    parameter_id: categoryParameter.id,
                    card_id: questionId,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                ],
              },
            ],
          });
        });
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    it("should allow editing filter settings without crashing (EMB-1171)", () => {
      cy.get<number>("@dashboardId").then((dashboardId) => {
        mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
      });

      getSdkRoot().within(() => {
        cy.button("Edit dashboard").click();

        H.filterWidget({ isEditing: true }).contains("Category").click();

        H.dashboardParameterSidebar()
          .should("be.visible")
          .findByText("Edit")
          .click();

        cy.findByText("Selectable values for Category").should("be.visible");
      });
    });
  });

  describe("Gauge visualization with long labels should not crash (EMB-1171)", () => {
    const SHORT_LABEL = "i will appear";

    const LONG_LABEL =
      "I AM AN EXTREMELY LONG LABEL THAT SHOULD OVERFLOW THE SVG BOUNDARIES";

    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();

      // Create a gauge question with segments that have very long labels
      H.createQuestion({
        name: "Gauge with Long Labels",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
        },
        display: "gauge",
        visualization_settings: {
          "gauge.segments": [
            {
              min: 0,
              max: 50,
              color: "#ED6E6E",
              label: SHORT_LABEL,
            },
            {
              min: 50,
              max: 100,
              color: "#F9CF48",
              label: LONG_LABEL,
            },
            {
              min: 100,
              max: 200,
              color: "#84BB4C",
              label: LONG_LABEL,
            },
          ],
        },
      }).then(({ body: card }) => {
        cy.wrap(card.id).as("gaugeQuestionId");
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    it("should clip gauge segments with long labels without crashing (EMB-1171)", () => {
      cy.get<number>("@gaugeQuestionId").then((questionId) => {
        mountSdkContent(<StaticQuestion questionId={questionId} />);
      });

      getSdkRoot().within(() => {
        cy.get("svg").should("be.visible");

        cy.log("gauge arcs should be rendered");
        cy.findByTestId("gauge-arc-0").should("be.visible");
        cy.findByTestId("gauge-arc-1").should("be.visible");
        cy.findByTestId("gauge-arc-2").should("be.visible");

        cy.log("short labels should be visible");
        cy.findByText(SHORT_LABEL).should("be.visible");

        cy.log("long labels should be clipped out");
        cy.findByText(/EXTREMELY LONG LABEL/).should("not.exist");
      });
    });
  });
});
