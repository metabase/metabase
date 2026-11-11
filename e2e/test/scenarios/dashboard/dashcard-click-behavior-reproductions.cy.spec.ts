const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type {
  CardId,
  DashboardId,
  Table,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockActionParameter } from "metabase-types/api/mocks";

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

describe("issue 66277", () => {
  const QUESTION: StructuredQuestionDetails = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour" }]],
    },
    display: "table",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createDashboardWithQuestions({ questions: [QUESTION] }).then(
      ({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      },
    );

    H.editDashboard();
  });

  it("should keep the time of an hour column in a click behavior to a saved question (metabase#66277)", () => {
    H.clickBehaviorSidebar().within(() => {
      cy.findByText("Created At: Hour").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });

    H.entityPickerModal().findByText("Orders").click();

    H.sidebar().findByText("Created At").scrollIntoView().click();

    H.popover().findByText("Created At: Hour").click();
    H.sidebar().button("Done").click();

    H.saveDashboard();

    H.getDashboardCard()
      .findByTestId("table-body")
      .findAllByTestId("link-formatted-text")
      .eq(0)
      .click();

    H.queryBuilderFiltersPanel()
      .findByText(
        /Created At is .* \d{1,2}:\d{2} (AM|PM) – \d{1,2}:\d{2} (AM|PM)/,
      )
      .should("be.visible");
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
            "field-id": PRODUCTS.CATEGORY,
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

function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
