const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, REVIEWS, PRODUCTS, PRODUCTS_ID, REVIEWS_ID } =
  SAMPLE_DATABASE;

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

      cy.get("@testTable").then((testTable) => {
        const dashboardDetails = {
          name: "18067 dashboard",
        };
        const questionDetails = {
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
            H.addOrUpdateDashboardCard({
              dashboard_id: dashboardId,
              card_id: nativeId,
              card: {
                // Add click behavior to the dashboard card and point it to the question 1
                visualization_settings: getVisualizationSettings(question1Id),
              },
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

    const getVisualizationSettings = (targetId) => ({
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
        ({ body: { id, card_id, dashboard_id } }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              id,
              visualization_settings: getVisualizationSettings(question1Id),
            },
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

    const getVisualizationSettings = (targetId) => ({
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
            display_name: "CATEGORY",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
    }).then(({ body: { id: questionId } }) => {
      // Share the question
      cy.request("POST", `/api/card/${questionId}/public_link`);

      H.createDashboard({ name: "17160D" }).then(
        ({ body: { id: dashboardId } }) => {
          // Share the dashboard
          cy.request("POST", `/api/dashboard/${dashboardId}/public_link`).then(
            ({ body: { uuid } }) => {
              cy.wrap(uuid).as("sourceDashboardUUID");
            },
          );
          cy.wrap(dashboardId).as("sourceDashboardId");

          // Add the question to the dashboard
          H.addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: questionId,
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

  function getVisualSettingsWithClickBehavior(questionTarget, dashboardTarget) {
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
      // Share the dashboard
      cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`);

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
    cy.get("@sourceDashboardId").then((id) => {
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

describe("issue 18454", () => {
  const CARD_DESCRIPTION = "CARD_DESCRIPTION";

  const questionDetails = {
    name: "18454 Question",
    description: CARD_DESCRIPTION,
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "line",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );
  });

  it("should show card descriptions (metabase#18454)", () => {
    cy.findByTestId("dashcard-container").realHover();
    cy.findByTestId("dashcard-container").within(() => {
      cy.icon("info").trigger("mouseenter", { force: true });
    });
    H.tooltip().should("contain", CARD_DESCRIPTION);
  });
});

describe("issue 23137", () => {
  const GAUGE_QUESTION_DETAILS = {
    display: "gauge",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
    },
  };

  const PROGRESS_QUESTION_DETAILS = {
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

  it("should navigate to a target from a gauge card (metabase#23137)", () => {
    const target_id = ORDERS_QUESTION_ID;

    H.createQuestionAndDashboard({
      questionDetails: GAUGE_QUESTION_DETAILS,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          id,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "question",
              targetId: target_id,
              parameterMapping: {},
            },
          },
        },
      });

      H.visitDashboard(dashboard_id);
    });

    cy.findByTestId("gauge-arc-1").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");
  });

  it("should navigate to a target from a progress card (metabase#23137)", () => {
    const target_id = ORDERS_QUESTION_ID;

    H.createQuestionAndDashboard({
      questionDetails: PROGRESS_QUESTION_DETAILS,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          id,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "question",
              targetId: target_id,
              parameterMapping: {},
            },
          },
        },
      });

      H.visitDashboard(dashboard_id);
    });

    cy.findByTestId("progress-bar").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");
  });
});

// Tests for issues 27020 and 27105 (static-viz rendering with date formatting options)
// have been moved to backend tests in metabase.channel.render.card-test

describe("issue 29304", () => {
  // Couldn't import from `metabase/common/components/ExplicitSize` because dependency issue.
  // It will fail Cypress tests.
  const WAIT_TIME = 300;

  const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

  const SCALAR_QUESTION = {
    name: "Scalar question",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
    display: "scalar",
  };

  const SCALAR_QUESTION_CARD = { size_x: 4, size_y: 3, row: 0, col: 0 };

  const SMART_SCALAR_QUESTION = {
    name: "Smart scalar question",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
    display: "smartscalar",
  };

  const SMART_SCALAR_QUESTION_CARD = { ...SCALAR_QUESTION_CARD, col: 4 };

  // Use full-app embedding to test because `ExplicitSize` checks for `isCypressActive`,
  // which checks `window.Cypress`, and will disable the refresh mode on Cypress test.
  // If we test by simply visiting the dashboard, the refresh mode will be disabled,
  // and we won't be able to reproduce the problem.
  const visitFullAppEmbeddingUrl = ({ url }) => {
    cy.visit({
      url,
      onBeforeLoad(window) {
        // cypress runs all tests in an iframe and the app uses this property to avoid embedding mode for all tests
        // by removing the property the app would work in embedding mode
        window.Cypress = undefined;
      },
    });
    H.collapseNavigationSidebar();
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("api/dashboard/*/dashcard/*/card/*/query").as(
      "getDashcardQuery",
    );
    cy.intercept("api/dashboard/*").as("getDashboard");
    cy.clock();
  });

  it("should render scalar and smart scalar with correct size on the first render (metabase#29304)", () => {
    H.createDashboard().then(({ body: dashboard }) => {
      H.createQuestionAndAddToDashboard(
        SCALAR_QUESTION,
        dashboard.id,
        SCALAR_QUESTION_CARD,
      );
      H.createQuestionAndAddToDashboard(
        SMART_SCALAR_QUESTION,
        dashboard.id,
        SMART_SCALAR_QUESTION_CARD,
      );

      visitFullAppEmbeddingUrl({ url: `/dashboard/${dashboard.id}` });

      cy.wait("@getDashboard");
      cy.wait(["@getDashcardQuery", "@getDashcardQuery"]);
      // This extra 1ms is crucial, without this the test would fail.
      cy.tick(WAIT_TIME + 1);

      [
        { index: 0, expectedWidth: 100 },
        { index: 1, expectedWidth: 47 },
      ].forEach(({ index, expectedWidth }) => {
        H.getDashboardCard(index)
          .findByTestId("scalar-value")
          .should(([$scalarValue]) => {
            expect($scalarValue.offsetWidth).to.be.closeTo(
              expectedWidth,
              expectedWidth * 0.2, // 20% tolerance for font rendering differences across Chrome versions
            );
          });
      });
    });
  });
});

describe("issue 31628", () => {
  const SCALAR_QUESTION = {
    name: "31628 Question - This is a rather lengthy question name",
    description: "This is a rather lengthy question description",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
    display: "scalar",
  };

  const SMART_SCALAR_QUESTION = {
    ...SCALAR_QUESTION,
    query: {
      ...SCALAR_QUESTION.query,
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
    display: "smartscalar",
  };

  const TREND_QUESTION = {
    display: "smartscalar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, null]],
        [
          "aggregation-options",
          ["*", ["count"], 10000],
          { name: "Mega Count", "display-name": "Mega Count" },
        ],
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "scalar.comparisons": [
        {
          id: "fecd2c69-4d43-57d0-6d60-6781a54beceb",
          type: "previousPeriod",
        },
        {
          id: "e8b8d831-d2a9-9fd7-17a7-db8b4834ac5a",
          type: "periodsAgo",
          value: 2,
        },
        {
          id: "9712f309-6849-20ba-7cef-54ae899a0e41",
          type: "anotherColumn",
          label: "Sum of Total",
          column: "sum",
        },
      ],
    },
  };

  const OVERFLOW_CHECKED_TEST_IDS = {
    scalar: ["scalar-container", "scalar-title"],
    smartscalar: ["scalar-container", "scalar-title", "scalar-previous-value"],
  };

  const ROW_WIDTHS = [6, 5, 4, 3, 2];

  const OVERFLOW_ROWS = [
    { display: "scalar", size_y: 2, row: 0 },
    { display: "scalar", size_y: 3, row: 2 },
    { display: "scalar", size_y: 4, row: 5 },
    { display: "smartscalar", size_y: 2, row: 9 },
  ];

  const OVERFLOW_CARDS = OVERFLOW_ROWS.flatMap(({ display, size_y, row }) =>
    ROW_WIDTHS.map((size_x, index) => ({
      display,
      size_x,
      size_y,
      row,
      col: ROW_WIDTHS.slice(0, index).reduce((sum, width) => sum + width, 0),
    })),
  );

  const TRUNCATION_CARDS = {
    scalar1x2: { display: "scalar", size_x: 1, size_y: 2, row: 0, col: 0 },
    scalar2x2: { display: "scalar", size_x: 2, size_y: 2, row: 0, col: 1 },
    scalar6x3: { display: "scalar", size_x: 6, size_y: 3, row: 0, col: 3 },
    smart2x2: { display: "smartscalar", size_x: 2, size_y: 2, row: 0, col: 9 },
    smart7x3: { display: "smartscalar", size_x: 7, size_y: 3, row: 0, col: 11 },
    smart7x4: { display: "smartscalar", size_x: 7, size_y: 4, row: 4, col: 0 },
    trend4x3: { display: "trend", size_x: 4, size_y: 3, row: 4, col: 7 },
  };

  const setupDashboard = (cards) => {
    H.createDashboardWithQuestions({
      questions: [SCALAR_QUESTION, SMART_SCALAR_QUESTION, TREND_QUESTION],
    }).then(({ dashboard, questions: [scalar, smartScalar, trend] }) => {
      const cardIds = {
        scalar: scalar.id,
        smartscalar: smartScalar.id,
        trend: trend.id,
      };
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: cards.map(({ display, ...layout }) => ({
          card_id: cardIds[display],
          ...layout,
        })),
      }).then(({ body: { dashcards } }) => {
        cy.wrap(
          cards.map(
            ({ row, col }) =>
              dashcards.find(
                (dashcard) => dashcard.row === row && dashcard.col === col,
              ).id,
          ),
        ).as("dashcardIds");
      });
      H.visitDashboard(dashboard.id);
    });
  };

  const getCard = (index) =>
    cy
      .get("@dashcardIds")
      .then((ids) => cy.get(`[data-dashcard-key="${ids[index]}"]`));

  const scalarContainer = (card) => card.findByTestId("scalar-container");
  const previousValue = (card) => card.findByTestId("scalar-previous-value");

  const moveMouseAway = () => {
    H.dashboardHeader().realHover({ position: "left" });
    cy.findByRole("tooltip").should("not.exist");
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render descendants of scalar and smart scalar cards without overflowing them (metabase#31628)", () => {
    cy.viewport(1440, 800);
    setupDashboard(OVERFLOW_CARDS);
    H.getDashboardCards().should("have.length", OVERFLOW_CARDS.length);

    cy.wait(100);
    H.openNavigationSidebar();

    cy.log("The dashboard fits the viewport, so no scrollbar narrows the grid");
    cy.get("main").should(([main]) => {
      expect(main.scrollHeight).to.be.at.most(main.clientHeight);
    });

    cy.get("@dashcardIds").then((ids) => {
      cy.findAllByTestId("dashcard").should((dashcards) => {
        OVERFLOW_CARDS.forEach(({ display, size_x, size_y }, index) => {
          const dashcard = dashcards.filter(
            `[data-dashcard-key="${ids[index]}"]`,
          )[0];
          const label = `${display} ${size_x}x${size_y}`;

          expect(
            dashcard.querySelectorAll("[data-testid='scalar-container']"),
            `${label} scalar-container`,
          ).to.have.length(1);
          if (display === "smartscalar") {
            expect(
              dashcard.querySelectorAll(
                "[data-testid='scalar-previous-value']",
              ),
              `${label} scalar-previous-value`,
            ).to.have.length(1);
          }

          OVERFLOW_CHECKED_TEST_IDS[display].forEach((testId) => {
            dashcard
              .querySelectorAll(`[data-testid='${testId}']`)
              .forEach((descendant) => {
                H.assertDescendantNotOverflowsContainer(
                  descendant,
                  dashcard,
                  `${label} [data-testid="${testId}"]`,
                );
              });
          });
        });
      });
    });
  });

  it("should follow truncation rules for scalar, smart scalar and trend cards (metabase#31628)", () => {
    const cards = Object.values(TRUNCATION_CARDS);
    const card = (key) => getCard(cards.indexOf(TRUNCATION_CARDS[key]));

    setupDashboard(cards);
    H.getDashboardCards().should("have.length", cards.length);

    cy.log("scalar 1x2: should truncate value and show value tooltip on hover");
    scalarContainer(card("scalar1x2")).then(($element) =>
      H.assertIsEllipsified($element[0]),
    );
    //TODO: Need to hover on the actual text, not just the container. This is a weird one
    scalarContainer(card("scalar1x2")).realHover({ position: "bottom" });
    cy.findByRole("tooltip").findByText("18,760").should("exist");
    moveMouseAway();

    cy.log("scalar 2x2: should not truncate value");
    scalarContainer(card("scalar2x2")).then(($element) =>
      H.assertIsNotEllipsified($element[0]),
    );
    cy.log(
      "scalar 2x2: should show the title tooltip on hover because the smallest cards hide the inline title",
    );
    scalarContainer(card("scalar2x2")).realHover();
    cy.findByRole("tooltip").findByText(SCALAR_QUESTION.name).should("exist");
    moveMouseAway();

    cy.log(
      "scalar 6x3: should not truncate value and should not show value tooltip on hover",
    );
    scalarContainer(card("scalar6x3")).then(($element) =>
      H.assertIsNotEllipsified($element[0]),
    );
    scalarContainer(card("scalar6x3")).realHover();
    cy.findByRole("tooltip").should("not.exist");
    moveMouseAway();

    cy.log("smart scalar 2x2: should not truncate value");
    scalarContainer(card("smart2x2")).then(($element) =>
      H.assertIsNotEllipsified($element[0]),
    );
    cy.log(
      "smart scalar 2x2: should show the title tooltip on hover because the smallest cards hide the inline title",
    );
    scalarContainer(card("smart2x2")).realHover();
    cy.findByRole("tooltip")
      .findByText(SMART_SCALAR_QUESTION.name)
      .should("exist");
    moveMouseAway();

    cy.log(
      "smart scalar 2x2: should not display the period, which wider cards show",
    );
    card("smart7x3")
      .findByTestId("scalar-period")
      .should("have.text", "Apr 2029");
    card("smart2x2").findByTestId("scalar-period").should("not.exist");

    cy.log(
      "smart scalar 2x2: should show the previous value as a percentage only (without truncation)",
    );
    previousValue(card("smart2x2"))
      .should("contain", "-34.72%")
      .and("not.contain", "527");
    previousValue(card("smart2x2")).then(($element) =>
      H.assertIsNotEllipsified($element[0]),
    );

    cy.log(
      "smart scalar 2x2: should show the full comparison in a panel on hover",
    );
    previousValue(card("smart2x2")).realHover();
    cy.findByRole("tooltip").within(() => {
      cy.contains("34.72%").should("exist");
      cy.contains("vs. previous month").should("exist");
      cy.contains("527").should("exist");
    });
    moveMouseAway();

    ["smart7x3", "smart7x4"].forEach((key) => {
      cy.log(`${key}: should truncate the inline title and show it on hover`);
      card(key).findByTestId("scalar-title").realHover();
      cy.findByRole("tooltip")
        .findByText(SMART_SCALAR_QUESTION.name)
        .should("exist");
      moveMouseAway();

      cy.log(`${key}: should show description tooltip on hover`);
      card(key).findByTestId("scalar-title").icon("info").realHover();
      cy.findByRole("tooltip")
        .findByText(SMART_SCALAR_QUESTION.description)
        .should("exist");
      moveMouseAway();

      cy.log(
        `${key}: should not truncate value and should not show value tooltip on hover`,
      );
      scalarContainer(card(key)).then(($element) =>
        H.assertIsNotEllipsified($element[0]),
      );
      scalarContainer(card(key)).realHover();
      cy.findByRole("tooltip").should("not.exist");
      moveMouseAway();

      cy.log(`${key}: should display the period as part of the comparison`);
      previousValue(card(key)).should("contain", "Apr 2029");

      cy.log(`${key}: should show previous value in full`);
      previousValue(card(key))
        .should("contain", "-34.72% MoM")
        .and("contain", "(527)");
      previousValue(card(key)).then(($element) =>
        H.assertIsNotEllipsified($element[0]),
      );

      cy.log(
        `${key}: should not show a panel for a single fully-displayed comparison`,
      );
      previousValue(card(key)).realHover();
      cy.findByRole("tooltip").should("not.exist");
      moveMouseAway();
    });

    cy.log(
      "trend 4x3: extra comparisons should only be shown in the hover panel",
    );
    previousValue(card("trend4x3"))
      .should("contain", "-34.72%")
      .and("not.contain", "36.65%")
      .and("not.contain", "98.88%");
    previousValue(card("trend4x3")).realHover();
    H.tooltip().within(() => {
      cy.findByText("34.72%").should("be.visible");
      cy.findByText("36.65%").should("be.visible");
      cy.findByText("98.88%").should("be.visible");
    });
  });
});

describe("issue 43219", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
  };

  const textFilter = createMockParameter({
    name: "Text",
    slug: "string",
    id: "5aefc726",
    type: "string/=",
    sectionId: "string",
  });

  const cardsCount = 10;

  const getQuestionAlias = (index) => `question-${index}`;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.cypressWaitAll(
      Array.from({ length: cardsCount }, (_value, index) => {
        const name = `Series ${index + 1}`;
        return H.createQuestion({ ...questionDetails, name }).then(
          ({ body: question }) => {
            cy.wrap(question).as(getQuestionAlias(index));
          },
        );
      }),
    );

    cy.then(function () {
      H.createDashboardWithQuestions({
        dashboardDetails: {
          parameters: [textFilter],
        },
        questions: [
          {
            ...questionDetails,
            name: "Base series",
          },
        ],
        cards: [
          {
            size_x: 4,
            size_y: 3,
            series: Array.from(
              { length: cardsCount },
              (_value, index) => this[getQuestionAlias(index)],
            ),
          },
        ],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });
    });
  });

  it("is possible to map parameters to dashcards with lots of series (metabase#43219)", () => {
    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Text")
      .click();

    H.getDashboardCard(0).within(() => {
      cy.findByText("Series 10").should("exist").and("not.be.visible");

      cy.findByTestId("visualization-root").scrollTo("bottom");
      cy.findByTestId("parameter-mapper-container").scrollTo("right");

      cy.findByText("Series 10").should("be.visible");
    });
  });
});

describe("issue 48878", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);

    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "/api/action").as("createAction");
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

    cy.intercept("GET", "/api/card/*").as("fetchCard");
    setup();
  });

  // I could only reproduce this issue in Cypress when I didn't use any helpers like createQuestion, etc.
  it("does not crash the action button viz (metabase#48878)", () => {
    cy.reload();
    cy.wait("@fetchCard");
    H.getDashboardCard(0).findByText("Click Me").should("be.visible");
  });

  function setup() {
    cy.log("create model");

    createModel({
      name: "SQL Model",
      query: "select * from orders limit 5",
    });

    cy.log("create model action");

    cy.findByTestId("qb-header-info-button").click();
    H.sidesheet().findByText("Actions").click();

    cy.findByTestId("model-actions-header").findByText("New action").click();

    H.modal().within(() => {
      H.NativeEditor.focus().type("UPDATE orders SET plan = {{ plan ", {
        parseSpecialCharSequences: false,
      });
      cy.button("Save").click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.modal()
      .last()
      .within(() => {
        cy.findByPlaceholderText("My new fantastic action").type("Test action");
        cy.button("Create").click();
        cy.wait("@createAction");
      });

    cy.visit("/");

    cy.log("create dashoard");

    cy.button("New").click();
    H.popover().findByText("Dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your dashboard?").type(
        "Dash",
      );
      cy.button("Create").click();
      cy.wait("@getDashboard");
    });

    cy.button("Add action").click();
    cy.button("Pick an action").click();
    H.modal().within(() => {
      cy.findByText("SQL Model").click();
      cy.findByText("Test action").click();
      cy.button("Done").click();
    });
    cy.button("Save").click();
    cy.wait("@updateDashboard");
    cy.wait("@fetchCard");
  }

  function createModel({ name, query }) {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    H.NativeEditor.focus().type(query);
    cy.findByTestId("native-query-editor-container")
      .findByTestId("run-button")
      .click();
    cy.wait("@dataset");
    cy.button("Save").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your model?").type(name);
      cy.button("Save").click();
      cy.wait("@saveQuestion");
    });
    cy.wait("@fetchCard");
  }
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
          "graph.series_order": null,
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
        "http://localhost:4000/?q={{group_name}}",
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
      "http://localhost:4000/?q=group_1__sub_group_1",
    );

    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(2).click(); // intentionally eq(2), not eq(1) - that's how row viz works
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_1__sub_group_2",
    );

    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(1).click(); // intentionally eq(1), not eq(2) - that's how row viz works
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_2__sub_group_1",
    );
    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(3).click();
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_2__sub_group_2",
    );
  });
});

describe("issue 67432", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should copy sorted table data in correct sorted order (metabase#67432)", () => {
    H.grantClipboardPermissions();

    const ROWS_LIMIT = 5;
    const questionDetails = {
      name: "67432 Question",
      query: {
        "source-table": PRODUCTS_ID,
        fields: [
          ["field", PRODUCTS.ID, null],
          ["field", PRODUCTS.TITLE, null],
          ["field", PRODUCTS.CATEGORY, null],
        ],
        limit: ROWS_LIMIT,
      },
    };

    H.createQuestionAndDashboard({
      questionDetails,
      cardDetails: {
        size_x: 16,
        size_y: 10,
      },
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    });

    // Wait for table to load
    H.tableInteractiveBody().should("be.visible");

    // Sort by Category column (descending first click)
    H.tableHeaderClick("Category");

    // Wait for sort to apply - the sort icon should appear
    H.tableHeaderColumn("Category")
      .closest("[data-testid=header-cell]")
      .icon("chevrondown")
      .should("exist");

    // Products 1-5 sorted by Category descending; equal categories keep their row order
    const EXPECTED_ROWS = [
      ["Rustic Paper Wallet", "Gizmo"],
      ["Enormous Marble Wallet", "Gadget"],
      ["Small Marble Shoes", "Doohickey"],
      ["Synergistic Granite Chair", "Doohickey"],
      ["Enormous Aluminum Shirt", "Doohickey"],
    ];

    H.tableInteractiveBody()
      .find('[data-column-id="CATEGORY"]')
      .should(($cells) => {
        expect($cells.toArray().map((cell) => cell.textContent)).to.deep.equal(
          EXPECTED_ROWS.map(([, category]) => category),
        );
      });

    // Select multiple cells across rows by dragging
    const getNonPKCells = () =>
      H.tableInteractiveBody().find(
        '[data-selectable-cell]:not([data-column-id="ID"])',
      );

    // Select Title and Category cells in every row
    getNonPKCells()
      .eq(0)
      .trigger("mousedown", { which: 1 })
      .then(() => {
        const lastCellIndex = ROWS_LIMIT * 2 - 1;
        getNonPKCells()
          .should("have.length", ROWS_LIMIT * 2)
          .eq(lastCellIndex)
          .trigger("mouseover", { buttons: 1 });
        getNonPKCells()
          .should("have.length", ROWS_LIMIT * 2)
          .eq(lastCellIndex)
          .trigger("mouseup");
      });

    // Copy to clipboard
    cy.realPress(["Meta", "c"]);

    // The clipboard holds tab-separated rows in the sorted order
    H.readClipboard().should(
      "equal",
      [["Title", "Category"], ...EXPECTED_ROWS]
        .map((cells) => cells.join("\t"))
        .join("\n"),
    );
  });
});

describe("issue 63416", () => {
  const questionDetails = {
    name: "63416 Question",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
      filter: [">=", ["field", ORDERS.CREATED_AT, null], "2027-01-01"],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const textFilter = createMockParameter({
      name: "Text",
      slug: "string",
      id: "5aefc726",
      type: "string/=",
      sectionId: "string",
    });

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [textFilter],
      },
      questions: [questionDetails],
    }).then(({ dashboard, questions }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: questions[0].id,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id: questions[0].id,
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
                  { "stage-number": 0 },
                ],
              },
            ],
          },
        ],
      });

      cy.wrap(dashboard.id).as("dashboardId");

      H.visitDashboard(dashboard.id);
    });
  });

  it("should download visualizer dashboard card without additional dataset with proper parameter values (metabase#63416)", function () {
    H.editDashboard();

    H.showDashcardVisualizerModalSettings(0, {
      isVisualizerCard: false,
    });

    cy.log("Make this a visualizer card");
    H.saveDashcardVisualizerModal();

    H.showDashboardCardActions(0);
    H.getDashboardCard(0).findByLabelText("Edit visualization").should("exist");

    H.saveDashboard();

    H.toggleFilterWidgetValues(["Doohickey"]);

    H.downloadAndAssert({
      fileType: "csv",
      isDashboard: true,
      downloadMethod: "POST",
      downloadUrl: `/api/dashboard/${this.dashboardId}/dashcard/*/card/*/query/csv`,
      assertParameters: [{ type: "string/=", value: ["Doohickey"] }],
    });
  });
});

describe("issue 76056", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);

    H.createDashboard().then(({ body: dashboard }) => {
      H.visitDashboard(dashboard.id);
    });
  });

  it("the dashcard actions panel should not have redundant horizontal space (metabase#76056)", () => {
    H.editDashboard();
    cy.button("Add action").click();
    cy.button("Close").click();

    H.showDashboardCardActions();

    cy.findByTestId("dashboardcard-actions-panel")
      .should("be.visible")
      .then(($panel) => {
        const panelRect = $panel[0].getBoundingClientRect();
        const buttonRects = Array.from($panel[0].querySelectorAll("a")).map(
          (button) => button.getBoundingClientRect(),
        );
        const maxRight = Math.max(...buttonRects.map((rect) => rect.right));
        const minLeft = Math.min(...buttonRects.map((rect) => rect.left));
        const contentWidth = maxRight - minLeft;

        expect(panelRect.width).to.be.closeTo(contentWidth, 10);
      });
  });
});
