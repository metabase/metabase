const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("issue 59049", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const categoryParameter = {
    id: "1b9cd9f1",
    name: "Category",
    slug: "category",
    type: "string/=",
    sectionId: "string",
  };

  const vendorParameter = {
    id: "1b9cd9f2",
    name: "Vendor",
    slug: "vendor",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [categoryParameter, vendorParameter],
  };

  function createDashboard() {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: card, questionId }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id: card.dashboard_id,
        card_id: questionId,
        card: {
          id: card.id,
          parameter_mappings: [
            {
              card_id: questionId,
              parameter_id: categoryParameter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, null],
                { "stage-number": 0 },
              ],
            },
            {
              card_id: questionId,
              parameter_id: vendorParameter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.VENDOR, null],
                { "stage-number": 0 },
              ],
            },
          ],
          visualization_settings: {
            column_settings: {
              '["name","CATEGORY"]': {
                click_behavior: {
                  parameterMapping: {
                    [categoryParameter.id]: {
                      id: categoryParameter.id,
                      source: {
                        type: "column",
                        id: "CATEGORY",
                        name: "Category",
                      },
                      target: {
                        type: "parameter",
                        id: categoryParameter.id,
                      },
                    },
                    [vendorParameter.id]: {
                      id: vendorParameter.id,
                      source: {
                        type: "column",
                        id: "VENDOR",
                        name: "Vendor",
                      },
                      target: {
                        type: "parameter",
                        id: vendorParameter.id,
                      },
                    },
                  },
                  type: "crossfilter",
                },
              },
            },
          },
        },
      });
      cy.wrap(card.dashboard_id).as("dashboardId");
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not reset parameter values in click behaviors when they are partially equal to the new values (metabase#59049)", () => {
    createDashboard();
    H.visitDashboard("@dashboardId");

    cy.log(
      "when not all old parameter values are equal to new values, do not reset",
    );
    H.filterWidget().first().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.assertTableRowsCount(53);
    H.getDashboardCard().findAllByText("Gadget").first().click();
    H.filterWidget().eq(0).should("contain", "Gadget");
    H.filterWidget().eq(1).should("contain", "Price, Schultz and Daniel");
    H.assertTableRowsCount(1);

    cy.log("when all old parameter values are equal to new values, reset");
    H.getDashboardCard().findAllByText("Gadget").first().click();
    H.filterWidget().eq(0).should("not.contain", "Gadget");
    H.filterWidget().eq(1).should("not.contain", "Price, Schultz and Daniel");
    H.assertTableRowsCount(200);
  });
});
