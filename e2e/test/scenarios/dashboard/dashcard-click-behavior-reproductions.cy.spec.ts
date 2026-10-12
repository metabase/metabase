const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type {
  CardId,
  DashboardId,
  DashboardParameterMapping,
  Parameter,
  Table,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockActionParameter,
  createMockParameter,
} from "metabase-types/api/mocks";

const {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

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

    H.saveDashboard();

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

describe("table and chart click behavior", () => {
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
      aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [
        [
          "field",
          PRODUCTS.CATEGORY,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: { parameters: [categoryParameter] },
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
        },
      });
      H.visitDashboard(dashcard.dashboard_id);

      H.editDashboard();
      H.clickBehaviorSidebar().findByText("Go to a custom destination").click();
      H.sidebar().findByText("URL").click();
      H.modal().within(() => {
        cy.findByRole("textbox").type(`/question/${dashcard.card_id}`);
        cy.button("Done").click();
      });
      H.sidebar().button("Done").click();
      H.saveDashboard();

      H.chartPathWithFillColor("#509EE3")
        .should("have.length", 4)
        .first()
        .click();
      cy.location("pathname").should(
        "include",
        `/question/${dashcard.card_id}`,
      );

      cy.log(
        "Change the saved question to a table, retaining the chart action",
      );
      H.openVizTypeSidebar();
      H.vizTypeSidebar().findByTestId("Table-button").click();
      H.vizTypeSidebar().button("Done").click();
      H.tableInteractive().should("be.visible");
      cy.intercept("PUT", `/api/card/${dashcard.card_id}`).as("updateQuestion");
      H.saveQuestion(null, { shouldReplaceOriginalQuestion: true });
      cy.wait("@updateQuestion");
      H.visitDashboard(dashcard.dashboard_id);
    });

    H.editDashboard();
    H.clickBehaviorSidebar().findByText("Product → Category").click();
    configureCategoryFilter();
    H.saveDashboard();
  });

  it("respects click behavior when changing between table and bar visualizations (#82956, #73448)", () => {
    for (const value of ["3,976", "297,270.99"]) {
      H.getDashboardCard().findByText(value).click();
      H.popover()
        .should("contain", "See these Orders")
        .and("contain", "Break out by…");
      H.filterWidget().should("not.contain", "Doohickey");
      cy.realPress("Escape");
    }

    H.getDashboardCard().findByText("Doohickey").click();
    H.filterWidget().should("contain", "Doohickey");
    H.assertTableRowsCount(1);
    cy.get(H.POPOVER_ELEMENT).should("not.exist");

    H.getDashboardCard().findByText("Doohickey").click();
    H.filterWidget().should("not.contain", "Doohickey");
    H.assertTableRowsCount(4);

    cy.log(
      "Convert the dashboard visualization, keeping the saved question a table",
    );
    H.editDashboard();
    H.showDashcardVisualizerModal(0, { isVisualizerCard: false });
    H.modal().findByRole("button", { name: "Save", exact: true }).click();
    H.modal().should("not.exist");
    H.clickBehaviorSidebar()
      .should("not.contain", "On-click behavior for each column")
      .findByText("Update a dashboard filter")
      .should("be.visible");
    configureCategoryFilter();
    H.saveDashboard();

    H.chartPathWithFillColor("#509EE3")
      .should("have.length", 4)
      .first()
      .click();
    H.filterWidget().should("contain", "Doohickey");
    cy.location("search").should("eq", "?category=Doohickey");
    cy.get(H.POPOVER_ELEMENT).should("not.exist");
    H.chartPathWithFillColor("#509EE3").should("have.length", 1).click();
    H.filterWidget().should("not.contain", "Doohickey");
    H.chartPathWithFillColor("#509EE3").should("have.length", 4);

    cy.log(
      "Clearing the chart action must not revive the old URL or table column action",
    );
    H.editDashboard();
    H.clickBehaviorSidebar().within(() => {
      cy.findByRole("button", {
        name: "filter icon Update a dashboard filter",
      }).click();
      cy.findByText("Open the Metabase drill-through menu").click();
      cy.button("Done").click();
    });
    H.saveDashboard();
    cy.reload();
    H.chartPathWithFillColor("#509EE3")
      .should("have.length", 4)
      .first()
      .click();
    H.popover().findByText("See these Orders").should("be.visible");
    H.filterWidget().should("not.contain", "Doohickey");
  });

  function configureCategoryFilter() {
    cy.findByTestId("click-behavior-sidebar").within(() => {
      cy.findByText("Update a dashboard filter").click();
      cy.findByText(categoryParameter.name).click();
    });
    H.popover().findByText("Product → Category").click();
    cy.findByTestId("click-behavior-sidebar").button("Done").click();
  }
});

describe("issue 16334", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not change the visualization type in a targetted question with mapped filter (metabase#16334)", () => {
    // Question 2, that we're adding to the dashboard
    const questionDetails = {
      query: {
        "source-table": REVIEWS_ID,
      },
    };

    H.createQuestion({
      name: "16334",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    }).then(({ body: { id: question1Id } }) => {
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { id, dashboard_id }, questionId }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id: questionId,
                row: 0,
                col: 0,
                size_x: 11,
                size_y: 8,
                visualization_settings: getVisualizationSettings(question1Id),
              },
            ],
          });

          H.visitDashboard(dashboard_id);
          cy.wait("@dashcardQuery");
        },
      );
    });

    cy.findAllByTestId("cell-data").contains("5").first().click();
    cy.wait("@dataset");

    // Make sure filter is set
    cy.findByTestId("qb-filters-panel").should(
      "contain.text",
      "Rating is equal to 5",
    );

    // Make sure it's connected to the original question
    cy.findByTestId("app-bar").should("contain.text", "Started from 16334");

    // Make sure the original visualization didn't change
    H.pieSlices().should("have.length", 2);

    // The legacy click behavior shape doesn't match `VisualizationSettings`
    const getVisualizationSettings = (targetId: CardId) => ({
      column_settings: {
        [`["ref",["field",${REVIEWS.RATING},null]]`]: {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${PRODUCTS.RATING},null],{"stage-number":0}]`]:
                {
                  source: {
                    type: "column",
                    id: "RATING",
                    name: "Rating",
                  },
                  target: {
                    type: "dimension",
                    id: [
                      `["dimension",["field",${PRODUCTS.RATING},null],{"stage-number":0}]`,
                    ],
                    dimension: [
                      "dimension",
                      ["field", PRODUCTS.RATING, null],
                      { "stage-number": 0 },
                    ],
                  },
                  id: [
                    `["dimension",["field",${PRODUCTS.RATING},null],{"stage-number":0}]`,
                  ],
                },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });
});

describe("issue 17160", () => {
  const TARGET_DASHBOARD_NAME = "Target dashboard";
  const CATEGORY_FILTER_PARAMETER_ID = "7c9ege62";

  function assertMultipleValuesFilterState() {
    cy.findByText("2 selections").click();

    cy.findByLabelText("Doohickey").should("be.checked");
    cy.findByLabelText("Gadget").should("be.checked");
  }

  function setup() {
    H.createNativeQuestion({
      name: "17160Q",
      native: {
        query: "SELECT * FROM products WHERE {{CATEGORY}}",
        "template-tags": {
          CATEGORY: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            name: "CATEGORY",
            "display-name": "CATEGORY",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
    }).then(({ body: { id: questionId } }) => {
      H.createDashboard({ name: "17160D" }).then(
        ({ body: { id: dashboardId } }) => {
          cy.wrap(dashboardId).as("sourceDashboardId");

          // Add the question to the dashboard
          H.addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: questionId,
            card: {},
          }).then(({ body: { id: dashCardId } }) => {
            // Add dashboard filter
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              parameters: [
                {
                  default: ["Doohickey", "Gadget"],
                  id: CATEGORY_FILTER_PARAMETER_ID,
                  name: "Category",
                  slug: "category",
                  sectionId: "string",
                  type: "string/=",
                },
              ],
            });

            createTargetDashboard().then((targetDashboardId) => {
              cy.wrap(targetDashboardId).as("targetDashboardId");

              // Create a click behaviour for the question card
              cy.request("PUT", `/api/dashboard/${dashboardId}`, {
                dashcards: [
                  {
                    id: dashCardId,
                    card_id: questionId,
                    row: 0,
                    col: 0,
                    size_x: 16,
                    size_y: 10,
                    parameter_mappings: [
                      {
                        parameter_id: CATEGORY_FILTER_PARAMETER_ID,
                        card_id: 4,
                        target: ["dimension", ["template-tag", "CATEGORY"]],
                      },
                    ],
                    visualization_settings: getVisualSettingsWithClickBehavior(
                      questionId,
                      targetDashboardId,
                    ),
                  },
                ],
              });
            });
          });
        },
      );
    });
  }

  function getVisualSettingsWithClickBehavior(
    questionTarget: CardId,
    dashboardTarget: DashboardId,
  ): VisualizationSettings {
    return {
      column_settings: {
        '["name","ID"]': {
          click_behavior: {
            targetId: questionTarget,
            parameterMapping: {
              "6b8b10ef-0104-1047-1e1b-2492d5954322": {
                source: {
                  type: "parameter",
                  id: CATEGORY_FILTER_PARAMETER_ID,
                  name: "Category",
                },
                target: {
                  type: "variable",
                  id: "CATEGORY",
                },
                id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              },
            },
            linkType: "question",
            type: "link",
            linkTextTemplate: "click-behavior-question-label",
          },
        },

        '["name","EAN"]': {
          click_behavior: {
            targetId: dashboardTarget,
            parameterMapping: {
              dd19ec03: {
                source: {
                  type: "parameter",
                  id: CATEGORY_FILTER_PARAMETER_ID,
                  name: "Category",
                },
                target: {
                  type: "parameter",
                  id: "dd19ec03",
                },
                id: "dd19ec03",
              },
            },
            linkType: "dashboard",
            type: "link",
            linkTextTemplate: "click-behavior-dashboard-label",
          },
        },
      },
    };
  }

  function createTargetDashboard() {
    return H.createQuestionAndDashboard({
      dashboardDetails: {
        name: TARGET_DASHBOARD_NAME,
      },
      questionDetails: {
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      // Add a filter
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: [
          {
            name: "Category",
            slug: "category",
            id: "dd19ec03",
            type: "string/=",
            sectionId: "string",
          },
        ],
      });

      // Resize the question card and connect the filter to it
      return cy
        .request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: "dd19ec03",
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        })
        .then(() => {
          return dashboard_id;
        });
    });
  }

  function visitSourceDashboard() {
    cy.get<DashboardId>("@sourceDashboardId").then((id) => {
      H.visitDashboard(id);
    });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should pass multiple filter values to questions and dashboards (metabase#17160-1)", () => {
    setup();

    // 1. Check click behavior connected to a question
    visitSourceDashboard();

    cy.findAllByText("click-behavior-question-label").eq(0).click();
    cy.wait("@cardQuery");

    cy.url().should("include", "/question");

    assertMultipleValuesFilterState();

    // 2. Check click behavior connected to a dashboard
    visitSourceDashboard();

    cy.get("@targetDashboardId").then((id) => {
      cy.intercept("POST", `/api/dashboard/${id}/dashcard/*/card/*/query`).as(
        "targetDashcardQuery",
      );

      cy.findAllByText("click-behavior-dashboard-label").eq(0).click();
      cy.wait("@targetDashcardQuery");
    });

    cy.url().should("include", "/dashboard");
    cy.location("search").should("eq", "?category=Doohickey&category=Gadget");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TARGET_DASHBOARD_NAME);

    assertMultipleValuesFilterState();
  });
});

describe("issue 23137", () => {
  const GAUGE_QUESTION_DETAILS: StructuredQuestionDetails = {
    display: "gauge",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
    },
  };

  const PROGRESS_QUESTION_DETAILS: StructuredQuestionDetails = {
    display: "progress",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should navigate to a target from gauge and progress cards (metabase#23137)", () => {
    const visualization_settings: VisualizationSettings = {
      click_behavior: {
        type: "link",
        linkType: "question",
        targetId: ORDERS_QUESTION_ID,
        parameterMapping: {},
      },
    };

    H.createDashboardWithQuestions({
      questions: [GAUGE_QUESTION_DETAILS, PROGRESS_QUESTION_DETAILS],
      cards: [
        { row: 0, col: 0, visualization_settings },
        { row: 0, col: 12, visualization_settings },
      ],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
    });

    cy.log("gauge");
    H.getDashboardCard(0).findByTestId("gauge-arc-1").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");

    cy.go("back");

    cy.log("progress");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    H.getDashboardCard(1).findByTestId("progress-bar").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");
  });
});

describe("issue 46318", () => {
  const query = `SELECT 'group_1' AS main_group, 'sub_group_1' AS sub_group, 111 AS value_sum, 'group_1__sub_group_1' AS group_name
UNION ALL
SELECT 'group_1', 'sub_group_2', 68, 'group_1__sub_group_2'
UNION ALL
SELECT 'group_2', 'sub_group_1', 79, 'group_2__sub_group_1'
UNION ALL
SELECT 'group_2', 'sub_group_2', 52, 'group_2__sub_group_2';
`;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
      questionDetails: {
        name: "46318",
        native: { query },
        display: "row",
        visualization_settings: {
          "graph.dimensions": ["MAIN_GROUP", "SUB_GROUP"],
          "graph.series_order_dimension": null,
          "graph.metrics": ["VALUE_SUM"],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });

    H.editDashboard();
    H.getDashboardCard().realHover().icon("click").click();
    cy.get("aside").within(() => {
      cy.findByText("Go to a custom destination").click();
      cy.findByText("URL").click();
    });
    H.modal().within(() => {
      cy.findByPlaceholderText("e.g. http://acme.com/id/{{user_id}}").type(
        `${Cypress.config("baseUrl")}/?q={{group_name}}`,
        { parseSpecialCharSequences: false },
      );
      cy.button("Done").click();
    });
    H.saveDashboard();
  });

  it("passes values from unused columns of row visualization to click behavior (metabase#46318)", () => {
    cy.findAllByRole("graphics-symbol").eq(0).click();
    cy.location("href").should(
      "eq",
      `${Cypress.config("baseUrl")}/?q=group_1__sub_group_1`,
    );

    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(2).click(); // intentionally eq(2), not eq(1) - that's how row viz works
    cy.location("href").should(
      "eq",
      `${Cypress.config("baseUrl")}/?q=group_1__sub_group_2`,
    );

    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(1).click(); // intentionally eq(1), not eq(2) - that's how row viz works
    cy.location("href").should(
      "eq",
      `${Cypress.config("baseUrl")}/?q=group_2__sub_group_1`,
    );
    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(3).click();
    cy.location("href").should(
      "eq",
      `${Cypress.config("baseUrl")}/?q=group_2__sub_group_2`,
    );
  });
});

describe("issue 17879", () => {
  const RAW_TARGET_NAME = "Q1 raw - 17879";
  const MONTH_TARGET_NAME = "Q1 month - 17879";

  const CASES = [
    {
      sourceDateUnit: "month",
      targetName: RAW_TARGET_NAME,
      expectedFilterText: "Created At is Apr 1–30, 2025",
    },
    {
      sourceDateUnit: "week",
      targetName: RAW_TARGET_NAME,
      expectedFilterText: "Created At is Apr 27 – May 3, 2025",
    },
    {
      sourceDateUnit: "year",
      targetName: RAW_TARGET_NAME,
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2025",
    },
    {
      sourceDateUnit: "year",
      targetName: MONTH_TARGET_NAME,
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2025",
    },
  ] as const;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should map dashcard date parameter to correct date range filter in target question (metabase#17879)", () => {
    H.createQuestion({
      name: RAW_TARGET_NAME,
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    });
    H.createQuestion({
      name: MONTH_TARGET_NAME,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        limit: 5,
      },
    });

    H.createDashboardWithQuestions({
      dashboardName: "Dashboard with aggregated Q2",
      questions: CASES.map(({ sourceDateUnit, targetName }) => ({
        name: `Q2 ${sourceDateUnit} to ${targetName}`,
        display: "line",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": sourceDateUnit }],
          ],
          limit: 5,
        },
      })),
      cards: [
        { row: 0, col: 0 },
        { row: 0, col: 12 },
        { row: 8, col: 0 },
        { row: 8, col: 12 },
      ],
    }).then(({ dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      H.visitDashboard(dashboard.id);
    });

    H.editDashboard();

    CASES.forEach(({ sourceDateUnit, targetName }, index) => {
      H.clickBehaviorSidebar(index).within(() => {
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      H.entityPickerModal().findByText(targetName).click();
      H.sidebar().findByText("Created At").click();
      H.popover()
        .findByText(`Created At: ${capitalize(sourceDateUnit)}`)
        .click();
      H.sidebar().button("Done").click();
    });

    H.saveDashboard();

    CASES.forEach(({ expectedFilterText }, index) => {
      if (index > 0) {
        H.visitDashboard("@dashboardId");
      }
      H.getDashboardCard(index)
        .scrollIntoView()
        .within(() => {
          H.cartesianChartCircle().first().click({ force: true });
        });

      cy.url().should("include", "/question");
      cy.findByTestId("qb-filters-panel").should(
        "have.text",
        expectedFilterText,
      );
    });
  });
});

describe("issue 56716", () => {
  function setupDashboard() {
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [
          ["field", PRODUCTS.ID, null],
          ["field", PRODUCTS.RATING, null],
        ],
      },
    };

    const parameterDetails: Parameter = {
      id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
      type: "number/=",
      target: ["dimension", ["field", PRODUCTS.RATING, null]],
      name: "Number",
      slug: "number",
    };

    const dashboardDetails: DashboardDetails = {
      parameters: [parameterDetails],
    };

    const vizSettings: VisualizationSettings = {
      column_settings: {
        '["name","RATING"]': {
          click_behavior: {
            type: "crossfilter",
            parameterMapping: {
              [parameterDetails.id]: {
                id: parameterDetails.id,
                source: { id: "RATING", name: "RATING", type: "column" },
                target: {
                  id: parameterDetails.id,
                  type: "parameter",
                },
              },
            },
          },
        },
      },
    };

    const getParameterMapping = (
      cardId: CardId,
    ): DashboardParameterMapping => ({
      card_id: cardId,
      parameter_id: parameterDetails.id,
      target: ["dimension", ["field", PRODUCTS.RATING, null]],
    });

    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashcard, questionId }) => {
      const { dashboard_id } = dashcard;

      H.editDashboardCard(dashcard, {
        parameter_mappings: [getParameterMapping(questionId)],
        visualization_settings: vizSettings,
      });

      H.visitDashboard(dashboard_id);
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should reset the filter when clicking on a column value twice with a click behavior enabled (metabase#56716)", () => {
    setupDashboard();

    H.getDashboardCard().findByText("4.6").click();
    H.filterWidget().should("contain.text", "4.6");
    H.getDashboardCard().findByText("4 rows").should("be.visible");

    H.getDashboardCard().findAllByText("4.6").first().click();
    H.filterWidget().should("not.contain.text", "4.6");
    H.getDashboardCard().findByText("200 rows").should("be.visible");
  });
});

describe("issue 58556, issue 66277", () => {
  const QUESTION: StructuredQuestionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour" }]],
    },
    display: "table",
  };

  const PARAMETER = createMockParameter({
    id: "date-param",
    name: "Date",
    slug: "date",
    type: "date/all-options",
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createDashboardWithQuestions({
      questions: [QUESTION],
      dashboardDetails: {
        parameters: [PARAMETER],
      },
    }).then(({ dashboard }) => {
      cy.request("GET", `/api/dashboard/${dashboard.id}`).then(
        ({ body: dashboard }) => {
          const [dashcard] = dashboard.dashcards;
          const parameter_mappings = [
            {
              card_id: dashcard.card_id,
              parameter_id: PARAMETER.id,
              target: [
                "dimension",
                [
                  "field",
                  "CREATED_AT",
                  {
                    "base-type": "type/DateTime",
                    "inherited-temporal-unit": "hour",
                  },
                ],
                {
                  "stage-number": 1,
                },
              ],
            },
          ];

          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            dashcards: [
              {
                ...dashcard,
                col: 0,
                size_x: 12,
                parameter_mappings,
              },
              {
                ...dashcard,
                id: -1,
                col: 12,
                size_x: 12,
                parameter_mappings,
              },
            ],
          });
        },
      );

      H.visitDashboard(dashboard.id);
    });

    H.editDashboard();
  });

  it("should keep the time of an hour column in click behavior parameters (metabase#58556, metabase#66277)", () => {
    cy.log("metabase#66277: go to a saved question");
    H.clickBehaviorSidebar(1).within(() => {
      cy.findByText("Created At: Hour").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });

    H.entityPickerModal().findByText("Orders").click();

    H.sidebar().findByText("Created At").scrollIntoView().click();

    H.popover().findByText("Created At: Hour").click();
    H.sidebar().button("Done").click();

    cy.log("metabase#58556: update a dashboard filter");
    H.clickBehaviorSidebar(0).within(() => {
      cy.findByText("Created At: Hour").click();
      cy.findByText("Update a dashboard filter").click();
      cy.findByText("Date").click();
    });

    H.popover().findByText("Created At: Hour").click();
    H.sidebar().button("Done").click();

    H.saveDashboard();

    cy.log("metabase#66277: click a row of the second card");
    H.getDashboardCard(1)
      .findByTestId("table-body")
      .findAllByTestId("link-formatted-text")
      .eq(0)
      .click();

    H.queryBuilderFiltersPanel()
      .findByText(
        /Created At is .* \d{1,2}:\d{2} (AM|PM) – \d{1,2}:\d{2} (AM|PM)/,
      )
      .should("be.visible");

    cy.go("back");

    cy.log("metabase#58556: click a row of the first card");
    H.getDashboardCard(0)
      .findByTestId("table-body")
      .findAllByTestId("link-formatted-text")
      .eq(0)
      .click();

    cy.log("ensure the filter contains a time value");
    cy.location("search").should((search) => {
      expect(new URLSearchParams(search).get("date")).to.match(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
      );
    });
  });
});

describe("issue 15368", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be possible to visit a dashboard with click-behavior linked to the dashboard without permissions (metabase#15368)", () => {
    cy.request("GET", "/api/user/current").then(
      ({ body: { personal_collection_id } }) => {
        // Save new dashboard in admin's personal collection
        cy.request("POST", "/api/dashboard", {
          name: "15368D",
          collection_id: personal_collection_id,
        }).then(({ body: { id: NEW_DASHBOARD_ID } }) => {
          const COLUMN_REF = `["ref",["field-id",${ORDERS.ID}]]`;
          // Add click behavior to the existing "Orders in a dashboard" dashboard
          cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
            dashcards: [
              {
                id: ORDERS_DASHBOARD_DASHCARD_ID,
                card_id: ORDERS_QUESTION_ID,
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 8,
                series: [],
                visualization_settings: {
                  column_settings: {
                    [COLUMN_REF]: {
                      click_behavior: {
                        type: "link",
                        linkType: "dashboard",
                        parameterMapping: {},
                        targetId: NEW_DASHBOARD_ID,
                      },
                    },
                  },
                },
                parameter_mappings: [],
              },
            ],
          });

          cy.intercept(
            "GET",
            `/api/dashboard/${ORDERS_DASHBOARD_ID}/query_metadata*`,
          ).as("queryMetadata");
        });
      },
    );
    cy.signInAsNormalUser();
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.wait("@queryMetadata");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});

describe("issue 13597", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should update a dashboard filter by clicking on a map pin (metabase#13597)", () => {
    H.createQuestion({
      name: "13597",
      query: {
        "source-table": PEOPLE_ID,
        limit: 2,
      },
      display: "map",
    }).then(({ body: { id: questionId } }) => {
      H.createDashboard().then(({ body: { id: dashboardId } }) => {
        // add filter (ID) to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          parameters: [
            {
              id: "92eb69ea",
              name: "ID",
              sectionId: "id",
              slug: "id",
              type: "id",
            },
          ],
        });

        H.addOrUpdateDashboardCard({
          card_id: questionId,
          dashboard_id: dashboardId,
          card: {
            parameter_mappings: [
              {
                parameter_id: "92eb69ea",
                card_id: questionId,
                target: ["dimension", ["field", PEOPLE.ID, null]],
              },
            ],
            visualization_settings: {
              // set click behavior to update filter (ID)
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  "92eb69ea": {
                    id: "92eb69ea",
                    source: { id: "ID", name: "ID", type: "column" },
                    target: {
                      id: "92eb69ea",
                      type: "parameter",
                    },
                  },
                },
              },
            },
          },
        });

        H.visitDashboard(dashboardId);
        H.mapPinIcon().eq(0).click({ force: true });
        cy.url().should("include", `/dashboard/${dashboardId}?id=1`);
        cy.contains("Hudson Borer - 1");
      });
    });
  });
});

describe("issue 14473", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should display column options for cross-filter (metabase#14473)", () => {
    const questionDetails = {
      name: "14473",
      native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
    };

    H.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.log("Add 4 filters to the dashboard");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [
            { name: "ID", slug: "id", id: "729b6456", type: "id" },
            { name: "ID 1", slug: "id_1", id: "bb20f59e", type: "id" },
            {
              name: "Category",
              slug: "category",
              id: "89873480",
              type: "category",
            },
            {
              name: "Category 1",
              slug: "category_1",
              id: "cbc045f2",
              type: "category",
            },
          ],
        });

        H.visitDashboard(dashboard_id);
      },
    );

    // Add cross-filter click behavior manually
    cy.icon("pencil").click();
    H.showDashboardCardActions();
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("click").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("COUNT(*)").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Update a dashboard filter").click();

    checkOptionsForFilter("ID");
    checkOptionsForFilter("Category");
  });
});

describe("issue 18067", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "should allow settings click behavior on boolean fields (metabase#18067)",
    { tags: "@external" },
    () => {
      const dialect = "mysql";
      const TEST_TABLE = "many_data_types";
      H.restore(`${dialect}-writable`);
      H.resetTestTable({ type: dialect, table: TEST_TABLE });
      cy.signInAsAdmin();
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: TEST_TABLE,
        tableAlias: "testTable",
      });

      cy.get<Table>("@testTable").then((testTable) => {
        const dashboardDetails = {
          name: "18067 dashboard",
        };
        const questionDetails: StructuredQuestionDetails = {
          name: "18067 question",
          database: WRITABLE_DB_ID,
          query: { "source-table": testTable.id },
        };
        H.createQuestionAndDashboard({
          dashboardDetails,
          questionDetails,
        }).then(({ body: { dashboard_id } }) => {
          H.visitDashboard(dashboard_id);
        });
      });

      H.editDashboard();

      cy.log('Select "click behavior" option');
      H.showDashboardCardActions();
      cy.findByTestId("dashboardcard-actions-panel").icon("click").click();

      H.sidebar().within(() => {
        cy.findByText("Boolean").scrollIntoView().click();
        cy.contains("Click behavior for Boolean").should("be.visible");
      });
    },
  );
});

describe("issue 15993", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show filters defined on a question with filter pass-thru (metabase#15993)", () => {
    H.createQuestion({
      name: "15993",
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: { id: question1Id } }) => {
      H.createNativeQuestion({ native: { query: "select 0" } }).then(
        ({ body: { id: nativeId } }) => {
          H.createDashboard().then(({ body: { id: dashboardId } }) => {
            // Add native question to the dashboard
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [
                {
                  id: -1,
                  card_id: nativeId,
                  row: 0,
                  col: 0,
                  size_x: 11,
                  size_y: 8,
                  // Add click behavior to the dashboard card and point it to the question 1
                  visualization_settings: getVisualizationSettings(question1Id),
                },
              ],
            });
            H.visitDashboard(dashboardId);
          });
        },
      );
    });

    // Drill-through
    cy.findAllByRole("gridcell").contains("0").realClick();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("117.03").should("not.exist"); // Total for the order in which quantity wasn't 0
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 0");

    // The legacy click behavior shape doesn't match `VisualizationSettings`
    const getVisualizationSettings = (targetId: CardId) => ({
      column_settings: {
        '["name","0"]': {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${ORDERS.QUANTITY},null]]`]: {
                source: {
                  type: "column",
                  id: "0",
                  name: "0",
                },
                target: {
                  type: "dimension",
                  id: [`["dimension",["field",${ORDERS.QUANTITY},null]]`],
                  dimension: ["dimension", ["field", ORDERS.QUANTITY, null]],
                },
                id: [`["dimension",["field",${ORDERS.QUANTITY},null]]`],
              },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });
});

describe("issue 13785", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should apply correct date range on a graph drill-through (metabase#13785)", () => {
    cy.log("Create a question");

    H.createQuestion({
      name: "13785",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    }).then(({ body: { id: QUESTION_ID } }) => {
      H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log("Add filter to the dashboard");

        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              id: "4ff53514",
              name: "Date Filter",
              slug: "date_filter",
              type: "date/all-options",
            },
          ],
        });

        cy.log("Add question to the dashboard");
        H.addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
          card: {
            // Set "Click behavior"
            visualization_settings: {
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  "4ff53514": {
                    source: {
                      type: "column",
                      id: "CREATED_AT",
                      name: "Created At",
                    },
                    target: {
                      type: "parameter",
                      id: "4ff53514",
                    },
                    id: "4ff53514",
                  },
                },
              },
            },
            // Connect filter and card
            parameter_mappings: [
              {
                parameter_id: "4ff53514",
                card_id: QUESTION_ID,
                target: ["dimension", ["field", REVIEWS.CREATED_AT, null]],
              },
            ],
          },
        });

        H.visitDashboard(DASHBOARD_ID);

        cy.intercept(
          "POST",
          `/api/dashboard/${DASHBOARD_ID}/dashcard/*/card/${QUESTION_ID}/query`,
        ).as("cardQuery");

        H.chartPathWithFillColor("#509EE3")
          .eq(14) // August 2026 (Total of 12 reviews, 9 unique days)
          .click();

        cy.wait("@cardQuery");
        cy.url().should("include", "2026-08");
        H.chartPathWithFillColor("#509EE3").should("have.length", 1);
        // Since hover doesn't work in Cypress we can't assert on the popover that's shown when one hovers the bar
        // But when this issue gets fixed, Y-axis should definitely show "12" (total count of reviews)
        H.echartsContainer().get("text").contains("12");
      });
    });
  });
});

function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function checkOptionsForFilter(filter: string) {
  cy.findByText("Available filters").parent().contains(filter).click();
  H.selectDropdown()
    .should("contain", "Columns")
    .and("contain", "COUNT(*)")
    .and("not.contain", "Dashboard filters");

  // Get rid of the open popover to be able to select another filter
  // Uses force: true because the popover is covering this text.
  cy.findByText("Pick one or more filters to update").click({ force: true });
}
