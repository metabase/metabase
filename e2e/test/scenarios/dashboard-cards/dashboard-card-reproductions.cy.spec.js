const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, REVIEWS, PRODUCTS, PRODUCTS_ID, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe("dashboard card reproductions", () => {
  before(() => {
    H.restore();
  });

  describe("issue 18067", () => {
    beforeEach(() => {
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

    function visitPublicSourceDashboard() {
      cy.get("@sourceDashboardUUID").then((uuid) => {
        cy.visit(`/public/dashboard/${uuid}`);

        cy.findByTextEnsureVisible("Enormous Wool Car");
      });
    }

    beforeEach(() => {
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

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

    it(
      "should pass multiple filter values to public questions and dashboards (metabase#17160-2)",
      { tags: "@skip" },
      () => {
        // FIXME: setup public dashboards
        setup();

        // 1. Check click behavior connected to a public question
        visitPublicSourceDashboard();

        cy.findAllByText("click-behavior-question-label").eq(0).click();

        cy.url().should("include", "/public/question");

        assertMultipleValuesFilterState();

        // 2. Check click behavior connected to a publicdashboard
        visitPublicSourceDashboard();

        cy.findAllByText("click-behavior-dashboard-label").eq(0).click();

        cy.url().should("include", "/public/dashboard");
        cy.location("search").should("eq", "?category=Doohickey&category=Gadget");

        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText(TARGET_DASHBOARD_NAME);

        assertMultipleValuesFilterState();
      },
    );
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(CARD_DESCRIPTION);
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

  describe("issues 27020 and 27105: static-viz fails to render for certain date formatting options", () => {
    const questionDetails27105 = {
      name: "27105",
      native: { query: "select current_date::date, 1", "template-tags": {} },
      display: "table",
      visualization_settings: {
        column_settings: {
          '["name","CAST(CURRENT_DATE AS DATE)"]': {
            date_style: "dddd, MMMM D, YYYY",
          },
        },
        "table.pivot_column": "CAST(CURRENT_DATE AS DATE)",
        "table.cell_column": "1",
      },
    };

    const questionDetails27020 = {
      name: "27020",
      native: {
        query: 'select current_date as "created_at", 1 "val"',
        "template-tags": {},
      },
      visualization_settings: {
        column_settings: { '["name","created_at"]': { date_abbreviate: true } },
        "table.pivot_column": "created_at",
        "table.cell_column": "val",
      },
    };

    function assertStaticVizRenders(questionDetails) {
      H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
        cy.request({
          method: "GET",
          url: `/api/pulse/preview_card_png/${id}`,
          failOnStatusCode: false,
        }).then(({ status, body }) => {
          expect(status).to.eq(200);
          expect(body).to.contain("PNG");
        });
      });
    }

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should render static-viz when date formatting is abbreviated (metabase#27020)", () => {
      // This is currently the default setting, anyway.
      // But we want to explicitly set it in case something changes in the future,
      // because it is a crucial step for this reproduction.
      H.updateSetting("custom-formatting", {
        "type/Temporal": {
          date_style: "MMMM D, YYYY",
        },
      });

      assertStaticVizRenders(questionDetails27020);
    });

    it("should render static-viz when date formatting contains day (metabase#27105)", () => {
      assertStaticVizRenders(questionDetails27105);
    });
  });

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

    const SMART_SCALAR_QUESTION_CARD = SCALAR_QUESTION_CARD;

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
    };

    describe("display: scalar", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
        cy.intercept("api/dashboard/*/dashcard/*/card/*/query").as(
          "getDashcardQuery",
        );
        cy.intercept("api/dashboard/*").as("getDashboard");
        cy.clock();
      });

      it("should render scalar with correct size on the first render (metabase#29304)", () => {
        H.createDashboard().then(({ body: dashboard }) => {
          H.createQuestionAndAddToDashboard(
            SCALAR_QUESTION,
            dashboard.id,
            SCALAR_QUESTION_CARD,
          );

          visitFullAppEmbeddingUrl({ url: `/dashboard/${dashboard.id}` });

          cy.wait("@getDashboard");
          cy.wait("@getDashcardQuery");
          // This extra 1ms is crucial, without this the test would fail.
          cy.tick(WAIT_TIME + 1);

          const expectedWidth = 130;
          cy.findByTestId("scalar-value").should(([$scalarValue]) => {
            expect($scalarValue.offsetWidth).to.be.closeTo(
              expectedWidth,
              expectedWidth * 0.1,
            );
          });
        });
      });

      it("should render smart scalar with correct size on the first render (metabase#29304)", () => {
        H.createDashboard().then(({ body: dashboard }) => {
          H.createQuestionAndAddToDashboard(
            SMART_SCALAR_QUESTION,
            dashboard.id,
            SMART_SCALAR_QUESTION_CARD,
          );

          visitFullAppEmbeddingUrl({ url: `/dashboard/${dashboard.id}` });

          cy.wait("@getDashboard");
          cy.wait("@getDashcardQuery");
          // This extra 1ms is crucial, without this the test would fail.
          cy.tick(WAIT_TIME + 1);

          const expectedWidth = 47;
          cy.findByTestId("scalar-value").should(([$scalarValue]) => {
            expect($scalarValue.offsetWidth).to.be.closeTo(
              expectedWidth,
              expectedWidth * 0.1,
            );
          });
        });
      });
    });
  });

  /**
   * This test suite reduces the number of "it" calls for performance reasons.
   * Every block with JSDoc within "it" callbacks should ideally be a separate "it" call.
   * @see https://github.com/metabase/metabase/pull/31722#discussion_r1246165418
   */
  describe("issue 31628", () => {
    const createCardsRow = ({ size_y }) => [
      { size_x: 6, size_y, row: 0, col: 0 },
      { size_x: 5, size_y, row: 0, col: 6 },
      { size_x: 4, size_y, row: 0, col: 11 },
      { size_x: 3, size_y, row: 0, col: 15 },
      { size_x: 2, size_y, row: 0, col: 18 },
    ];

    const VIEWPORTS = [
      // { width: 375, height: 667, openSidebar: false },
      // { width: 820, height: 800, openSidebar: true },
      // { width: 820, height: 800, openSidebar: false },
      // { width: 1200, height: 800, openSidebar: true },
      { width: 1440, height: 800, openSidebar: true },
      // { width: 1440, height: 800, openSidebar: false },
    ];

    const SCALAR_QUESTION = {
      name: "31628 Question - This is a rather lengthy question name",
      description: "This is a rather lengthy question description",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
    };

    const SCALAR_QUESTION_CARDS = [
      { cards: createCardsRow({ size_y: 2 }), name: "cards 2 cells high" },
      { cards: createCardsRow({ size_y: 3 }), name: "cards 3 cells high" },
      { cards: createCardsRow({ size_y: 4 }), name: "cards 4 cells high" },
    ];

    const SMART_SCALAR_QUESTION = {
      name: "31628 Question - This is a rather lengthy question name",
      description: "This is a rather lengthy question description",
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

    const SMART_SCALAR_QUESTION_CARDS = [
      { cards: createCardsRow({ size_y: 2 }), name: "cards 2 cells high" },
      // { cards: createCardsRow({ size_y: 3 }), name: "cards 3 cells high" },
      // { cards: createCardsRow({ size_y: 4 }), name: "cards 4 cells high" },
    ];

    const setupDashboardWithQuestionInCards = (question, cards) => {
      H.createDashboard().then(({ body: dashboard }) => {
        H.cypressWaitAll(
          cards.map((card) => {
            return H.createQuestionAndAddToDashboard(
              question,
              dashboard.id,
              card,
            );
          }),
        );

        H.visitDashboard(dashboard.id);
      });
    };

    const assertDescendantsNotOverflowDashcards = (descendantsSelector) => {
      cy.findAllByTestId("dashcard").should((dashcards) => {
        dashcards.each((dashcardIndex, dashcard) => {
          const descendants = dashcard.querySelectorAll(descendantsSelector);

          descendants.forEach((descendant) => {
            H.assertDescendantNotOverflowsContainer(
              descendant,
              dashcard,
              `dashcard[${dashcardIndex}] [data-testid="${descendant.dataset.testid}"]`,
            );
          });
        });
      });
    };

    describe("display: scalar", () => {
      const descendantsSelector = [
        "[data-testid='scalar-container']",
        "[data-testid='scalar-title']",
        "[data-testid='scalar-description']",
      ].join(",");

      VIEWPORTS.forEach(({ width, height, openSidebar }) => {
        SCALAR_QUESTION_CARDS.forEach(({ cards, name }) => {
          const sidebar = openSidebar ? "sidebar open" : "sidebar closed";

          describe(`${width}x${height} - ${sidebar} - ${name}`, () => {
            beforeEach(() => {
              cy.viewport(width, height);
              cy.signInAsAdmin();
              setupDashboardWithQuestionInCards(SCALAR_QUESTION, cards);

              if (openSidebar) {
                cy.wait(100);
                H.openNavigationSidebar();
              }
            });

            it("should render descendants of a 'scalar' without overflowing it (metabase#31628)", () => {
              assertDescendantsNotOverflowDashcards(descendantsSelector);
            });
          });
        });
      });

      describe("1x2 card", () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
            { size_x: 1, size_y: 2, row: 0, col: 0 },
          ]);
        });

        it("should follow truncation rules", () => {
          cy.log("should truncate value and show value tooltip on hover");

          scalarContainer().then(($element) =>
            H.assertIsEllipsified($element[0]),
          );
          //TODO: Need to hover on the actual text, not just the container. This is a weird one
          scalarContainer().realHover({ position: "bottom" });

          cy.findByRole("tooltip").findByText("18,760").should("exist");
        });
      });

      describe("2x2 card", () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
            { size_x: 2, size_y: 2, row: 0, col: 0 },
          ]);
        });

        it("should follow truncation rules", () => {
          cy.log(
            "should not truncate value and should not show value tooltip on hover",
          );
          scalarContainer().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
          scalarContainer().realHover();

          cy.findByRole("tooltip").should("not.exist");
        });
      });

      describe("5x3 card", () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
            { size_x: 6, size_y: 3, row: 0, col: 0 },
          ]);
        });

        it("should follow truncation rules", () => {
          cy.log(
            "should not truncate value and should not show value tooltip on hover",
          );
          scalarContainer().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
          scalarContainer().realHover();

          cy.findByRole("tooltip").should("not.exist");
        });
      });
    });

    describe("display: smartscalar", () => {
      const descendantsSelector = [
        "[data-testid='legend-caption']",
        "[data-testid='scalar-container']",
        "[data-testid='scalar-previous-value']",
      ].join(",");

      VIEWPORTS.forEach(({ width, height, openSidebar }) => {
        SMART_SCALAR_QUESTION_CARDS.forEach(({ cards, name }) => {
          const sidebar = openSidebar ? "sidebar open" : "sidebar closed";

          describe(`${width}x${height} - ${sidebar} - ${name}`, () => {
            beforeEach(() => {
              cy.viewport(width, height);
              cy.signInAsAdmin();
              setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, cards);

              if (openSidebar) {
                H.openNavigationSidebar();
              }
            });

            it("should render descendants of a 'smartscalar' without overflowing it (metabase#31628)", () => {
              assertDescendantsNotOverflowDashcards(descendantsSelector);
            });
          });
        });
      });

      describe("2x2 card", () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
            { size_x: 2, size_y: 2, row: 0, col: 0 },
          ]);
        });

        it("should follow truncation rules", () => {
          cy.log(
            "it should not truncate value and should not show value tooltip on hover",
          );
          scalarContainer().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
          scalarContainer().realHover();

          cy.findByRole("tooltip").should("not.exist");

          cy.log(
            "it should not display period because the card height is too small to fit it",
          );
          cy.findByTestId("scalar-period").should("not.exist");

          cy.log("it should truncate title and show title tooltip on hover");
          cy.findByTestId("legend-caption-title")
            .as("title")
            .then(($element) => H.assertIsEllipsified($element[0]));
          cy.get("@title").realHover();

          cy.findByRole("tooltip")
            .findByText(SMART_SCALAR_QUESTION.name)
            .should("exist");

          cy.log("it should show previous value tooltip on hover");
          cy.findByTestId("scalar-previous-value").realHover();

          cy.findByRole("tooltip").within(() => {
            cy.contains("34.72%").should("exist");
            cy.contains("vs. previous month: 527").should("exist");
          });

          cy.log(
            "it should show previous value as a percentage only (without truncation)",
          );
          previousValue()
            .should("contain", "35%")
            .and("not.contain", "vs. previous month: 527");

          previousValue().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
        });

        it("should show previous value as a percentage without decimal places (without truncation, 1000x600)", () => {
          cy.viewport(1000, 600);

          previousValue()
            .should("contain", "35%")
            .and("not.contain", "34.72%")
            .and("not.contain", "vs. previous month: 527");

          previousValue().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
        });

        it("should truncate previous value (840x600)", () => {
          cy.viewport(840, 600);

          previousValue()
            .findByText("35%")
            .should(($element) => H.assertIsEllipsified($element[0]));
        });
      });

      describe("7x3 card", () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
            { size_x: 7, size_y: 3, row: 0, col: 0 },
          ]);
        });

        it("should follow truncation rules", () => {
          cy.log(
            "should not truncate value and should not show value tooltip on hover",
          );
          scalarContainer().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
          scalarContainer().realHover();

          cy.findByRole("tooltip").should("not.exist");

          cy.log("it should display the period");
          cy.findByTestId("scalar-period").should("have.text", "Apr 2026");

          cy.log("should truncate title and show title tooltip on hover");

          cy.findByTestId("legend-caption-title")
            .as("title")
            .then(($element) => H.assertIsEllipsified($element[0]));
          cy.get("@title").realHover();

          cy.findByRole("tooltip")
            .findByText(SMART_SCALAR_QUESTION.name)
            .should("exist");

          cy.log("should show description tooltip on hover");
          cy.findByTestId("legend-caption").icon("info").realHover();

          cy.findByRole("tooltip")
            .findByText(SMART_SCALAR_QUESTION.description)
            .should("exist");

          cy.log("should show previous value in full");
          previousValue()
            .should("contain", "34.72%")
            .and("contain", "vs. previous month: 527");
          previousValue().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );

          cy.log("should not show previous value tooltip on hover");
          cy.findByTestId("scalar-previous-value").realHover();

          cy.findByRole("tooltip").should("not.exist");
        });
      });

      describe("7x4 card", () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
            { size_x: 7, size_y: 4, row: 0, col: 0 },
          ]);
        });

        it("should follow truncation rules", () => {
          cy.log(
            "should not truncate value and should not show value tooltip on hover",
          );
          scalarContainer().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );
          scalarContainer().realHover();

          cy.findByRole("tooltip").should("not.exist");

          cy.log("it should display the period");
          cy.findByTestId("scalar-period").should("have.text", "Apr 2026");

          cy.log("should truncate title and show title tooltip on hover");
          cy.findByTestId("legend-caption-title")
            .as("title")
            .then(($element) => H.assertIsEllipsified($element[0]));
          cy.get("@title").realHover();

          cy.findByRole("tooltip")
            .findByText(SMART_SCALAR_QUESTION.name)
            .should("exist");

          cy.log("should show description tooltip on hover");
          cy.findByTestId("legend-caption").icon("info").realHover();

          cy.findByRole("tooltip")
            .findByText(SMART_SCALAR_QUESTION.description)
            .should("exist");

          cy.log("should show previous value in full");
          previousValue()
            .should("contain", "34.72%")
            .and("contain", "vs. previous month: 527");
          previousValue().then(($element) =>
            H.assertIsNotEllipsified($element[0]),
          );

          cy.log("should not show previous value tooltip on hover");
          cy.findByTestId("scalar-previous-value").realHover();

          cy.findByRole("tooltip").should("not.exist");
        });
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

      let fetchCardRequestsCount = 0;

      cy.intercept("GET", "/api/card/*", (request) => {
        // we only want to simulate the race condition 4th time this request is triggered
        if (fetchCardRequestsCount === 2) {
          request.continue(
            () => new Promise((resolve) => setTimeout(resolve, 2000)),
          );
        } else {
          request.continue();
        }

        ++fetchCardRequestsCount;
      }).as("fetchCard");
      setup();
    });

    // I could only reproduce this issue in Cypress when I didn't use any helpers like createQuestion, etc.
    it("does not crash the action button viz (metabase#48878)", () => {
      cy.reload();
      cy.wait("@fetchCard");
      H.getDashboardCard(0).findByText("Click Me").should("be.visible");
    });

    function setup() {
      cy.log("create dummy model");

      // Create a dummy model so that GET /api/search does not return the model want to test.
      // If we don't do this, GET /api/search will return and put card object with dataset_query
      // attribute in the redux store (entity framework) which would prevent the issue from happening.
      createModel({
        name: "Dummy model",
        query: "select 1",
      });

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

      // Collect the visual order of categories from the table
      const visualCategories = [];
      H.tableInteractiveBody()
        .find('[data-column-id="CATEGORY"]')
        .each(($cell) => {
          visualCategories.push($cell.text());
        })
        .then(() => {
          // Select multiple cells across rows by dragging
          const getNonPKCells = () =>
            H.tableInteractiveBody().find(
              '[data-selectable-cell]:not([data-column-id="ID"])',
            );

          // Select cells in first two rows (4 cells: Title+Category for 2 rows)
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

          // Verify clipboard content has rows in sorted order
          H.readClipboard().then((clipboardText) => {
            // The clipboard should contain properly tab-separated content
            // with newlines between rows (not a single cell)
            const lines = clipboardText.split("\n");

            // Should have header row + data rows (at least 6 lines: header + 5 data rows)
            expect(lines.length).to.be.eq(ROWS_LIMIT + 1);

            // Header should be tab-separated with both columns
            const headerCells = lines[0].split("\t");
            expect(headerCells).to.include("Title");
            expect(headerCells).to.include("Category");

            // Verify each data row is tab-separated and in the correct sorted order
            const clipboardCategories = lines.slice(1).map((line) => {
              const cells = line.split("\t");
              // Category is the second column
              return cells[1];
            });

            // The categories in clipboard should match the visual order
            for (let i = 0; i < clipboardCategories.length; i++) {
              expect(clipboardCategories[i]).to.equal(visualCategories[i]);
            }
          });
        });
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
        filter: [">=", ["field", ORDERS.CREATED_AT, null], "2024-01-01"],
      },
    };

    beforeEach(() => {
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

        H.visitDashboard(dashboard.id);
      });
    });

    it("should download visualizer dashboard card without additional dataset with proper parameter values (metabase#63416)", () => {
      H.editDashboard();

      H.showDashcardVisualizerModalSettings(0, {
        isVisualizerCard: false,
      });
      H.modal()
        .findByLabelText("Description")
        .type("Make this a visualizer card");

      H.saveDashcardVisualizerModal();

      H.saveDashboard();

      H.toggleFilterWidgetValues(["Doohickey"]);

      H.downloadAndAssert({
        fileType: "csv",
        isDashboard: true,
        downloadMethod: "POST",
        downloadUrl: "/api/dashboard/10/dashcard/*/card/*/query/csv",
        assertParameters: [{ type: "string/=", value: ["Doohickey"] }],
      });
    });
  });
});

const scalarContainer = () => cy.findByTestId("scalar-container");
const previousValue = () => cy.findByTestId("scalar-previous-value");
