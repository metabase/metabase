const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import { createMockActionParameter } from "metabase-types/api/mocks";

const { PRODUCTS_ID, PRODUCTS, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

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

describe("issue 64368", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should reset to default value when unsetting a required filter with a default through click behavior (metabase#64368)", () => {
    const DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT = createMockActionParameter({
      id: "5",
      name: "Required Filter",
      slug: "required-filter",
      type: "string/=",
      sectionId: "string",
      default: "Doohickey",
      required: true,
    });

    const testQuestionDetails = {
      name: "Orders by Category",
      display: "table",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
        limit: 5,
      },
    };

    const dashboardDetails = {
      parameters: [DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT],
    };

    H.createQuestionAndDashboard({
      questionDetails: testQuestionDetails,
      dashboardDetails,
    }).then(({ body: dashcard }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          parameter_mappings: [
            {
              card_id: dashcard.card_id,
              parameter_id: DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT.id,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  {
                    "base-type": "type/Text",
                    "source-field": ORDERS.PRODUCT_ID,
                  },
                ],
              ],
            },
          ],
        },
      });
      H.visitDashboard(dashcard.dashboard_id);
      cy.location().then(({ pathname }) => {
        cy.wrap(pathname).as("originalPathname");
      });
    });

    cy.log("Verify initial state with default filter value");
    cy.findAllByTestId("parameter-widget")
      .should("have.length", 1)
      .should("contain.text", "Doohickey");

    cy.log("Configure click behavior to update dashboard filter");
    H.editDashboard();

    H.clickBehaviorSidebar().within(() => {
      cy.findByText("Product → Category").click();
      cy.findByText("Update a dashboard filter").click();
      cy.findByText(DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT.name).click();
    });

    H.popover().within(() => {
      cy.findByText("Product → Category").should("exist").click();
    });

    cy.findByTestId("click-behavior-sidebar").button("Done").click();

    H.saveDashboard({ waitMs: 250 });

    cy.log("Set dashboard filter to contain all values");
    cy.findAllByTestId("parameter-widget").click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByText("Update filter").click();
    });

    cy.log("Click on a category row to set filter value to Gadget");
    H.getDashboardCard().findByText("Gadget").click();
    cy.findAllByTestId("parameter-widget")
      .should("have.length", 1)
      .should("contain.text", "Gadget");

    cy.log(
      "Click same category again to unset - should reset to default value Doohickey, not blank",
    );
    H.getDashboardCard().findByText("Gadget").click();
    cy.findAllByTestId("parameter-widget")
      .should("have.length", 1)
      .should("contain.text", "Doohickey");
  });
});

describe("issue 73448", () => {
  const productCategories = ["Doohickey", "Gadget", "Gizmo", "Widget"];

  const categoryParameter = createMockActionParameter({
    id: "category",
    name: "Category",
    slug: "category",
    type: "string/=",
    sectionId: "string",
  });

  const questionDetails: StructuredQuestionDetails = {
    name: "Orders by Category",
    display: "bar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          PRODUCTS.CATEGORY,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
      ],
      limit: 5,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("updates a dashboard filter from a bar chart dimension click behavior (#73448)", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        parameters: [categoryParameter],
      },
    }).then(({ body: dashcard }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id: dashcard.dashboard_id,
        card_id: dashcard.card_id,
        card: {
          id: dashcard.id,
          parameter_mappings: [
            {
              card_id: dashcard.card_id,
              parameter_id: categoryParameter.id,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  {
                    "base-type": "type/Text",
                    "source-field": ORDERS.PRODUCT_ID,
                  },
                ],
              ],
            },
          ],
          visualization_settings: {
            column_settings: {
              '["name","CATEGORY"]': {
                click_behavior: {
                  type: "crossfilter",
                  parameterMapping: {
                    [categoryParameter.id]: {
                      id: categoryParameter.id,
                      source: {
                        type: "column",
                        id: "CATEGORY",
                        name: "Product → Category",
                      },
                      target: {
                        type: "parameter",
                        id: categoryParameter.id,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      H.visitDashboard(dashcard.dashboard_id);
    });

    cy.location("pathname").as("dashboardPath");

    H.chartPathWithFillColor("#509EE3")
      .should("have.length", 4)
      .first()
      .click();

    cy.log("dashboard filter updates with the clicked category value");
    H.filterWidget()
      .invoke("text")
      .should((text) => {
        expect(
          productCategories.some((category) => text.includes(category)),
        ).to.equal(true);
      });
    cy.location("search").should((search) => {
      expect(new URLSearchParams(search).get("category")).to.be.oneOf(
        productCategories,
      );
    });

    cy.log("drill-through popover is not shown and navigation stays put");
    cy.get(H.POPOVER_ELEMENT).should("not.exist");
    cy.get("@dashboardPath").then((dashboardPath) => {
      cy.location("pathname").should("eq", dashboardPath);
    });
  });
});
