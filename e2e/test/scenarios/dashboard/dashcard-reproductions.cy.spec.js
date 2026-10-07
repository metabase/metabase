const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CARD_DESCRIPTION);
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
      H.restore();
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

        const expectedWidth = 100;
        cy.findByTestId("scalar-value").should(([$scalarValue]) => {
          expect($scalarValue.offsetWidth).to.be.closeTo(
            expectedWidth,
            expectedWidth * 0.2, // 20% tolerance for font rendering differences across Chrome versions
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
            expectedWidth * 0.2, // 20% tolerance for font rendering differences across Chrome versions
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
            H.restore();
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
        H.restore();
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
        H.restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
          { size_x: 2, size_y: 2, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        cy.log("should not truncate value");
        scalarContainer().then(($element) =>
          H.assertIsNotEllipsified($element[0]),
        );

        cy.log(
          "should show the title tooltip on hover because the smallest cards hide the inline title",
        );
        scalarContainer().realHover();

        cy.findByRole("tooltip")
          .findByText(SCALAR_QUESTION.name)
          .should("exist");
      });
    });

    describe("5x3 card", () => {
      beforeEach(() => {
        H.restore();
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
      "[data-testid='scalar-title']",
      "[data-testid='scalar-container']",
      "[data-testid='scalar-previous-value']",
    ].join(",");

    VIEWPORTS.forEach(({ width, height, openSidebar }) => {
      SMART_SCALAR_QUESTION_CARDS.forEach(({ cards, name }) => {
        const sidebar = openSidebar ? "sidebar open" : "sidebar closed";

        describe(`${width}x${height} - ${sidebar} - ${name}`, () => {
          beforeEach(() => {
            H.restore();
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
        H.restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
          { size_x: 2, size_y: 2, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        cy.log("it should not truncate value");
        scalarContainer().then(($element) =>
          H.assertIsNotEllipsified($element[0]),
        );

        cy.log(
          "it should show the title tooltip on hover because the smallest cards hide the inline title",
        );
        scalarContainer().realHover();

        cy.findByRole("tooltip")
          .findByText(SMART_SCALAR_QUESTION.name)
          .should("exist");

        cy.log("it should not display the period on dashboard cards");
        cy.findByTestId("scalar-period").should("not.exist");

        cy.log(
          "it should show the previous value as a percentage only (without truncation)",
        );
        previousValue().should("contain", "-34.72%").and("not.contain", "527");

        previousValue().then(($element) =>
          H.assertIsNotEllipsified($element[0]),
        );

        cy.log("it should show the full comparison in a panel on hover");
        previousValue().realHover();

        cy.findByRole("tooltip").within(() => {
          cy.contains("34.72%").should("exist");
          cy.contains("vs. previous month").should("exist");
          cy.contains("527").should("exist");
        });
      });
    });

    describe("7x3 card", () => {
      beforeEach(() => {
        H.restore();
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

        cy.log("it should display the period as part of the comparison");
        previousValue().should("contain", "Apr 2029");

        cy.log("should truncate the inline title and show it on hover");
        cy.findByTestId("scalar-title").realHover();

        cy.findByRole("tooltip")
          .findByText(SMART_SCALAR_QUESTION.name)
          .should("exist");

        cy.log("should show description tooltip on hover");
        cy.findByTestId("scalar-title").icon("info").realHover();

        cy.findByRole("tooltip")
          .findByText(SMART_SCALAR_QUESTION.description)
          .should("exist");

        cy.log("should show previous value in full");
        previousValue()
          .should("contain", "-34.72% MoM")
          .and("contain", "(527)");
        previousValue().then(($element) =>
          H.assertIsNotEllipsified($element[0]),
        );

        cy.log(
          "should not show a panel for a single fully-displayed comparison",
        );
        cy.findByTestId("scalar-previous-value").realHover();

        cy.findByRole("tooltip").should("not.exist");
      });
    });

    describe("7x4 card", () => {
      beforeEach(() => {
        H.restore();
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

        cy.log("it should display the period as part of the comparison");
        previousValue().should("contain", "Apr 2029");

        cy.log("should truncate the inline title and show it on hover");
        cy.findByTestId("scalar-title").realHover();

        cy.findByRole("tooltip")
          .findByText(SMART_SCALAR_QUESTION.name)
          .should("exist");

        cy.log("should show description tooltip on hover");
        cy.findByTestId("scalar-title").icon("info").realHover();

        cy.findByRole("tooltip")
          .findByText(SMART_SCALAR_QUESTION.description)
          .should("exist");

        cy.log("should show previous value in full");
        previousValue()
          .should("contain", "-34.72% MoM")
          .and("contain", "(527)");
        previousValue().then(($element) =>
          H.assertIsNotEllipsified($element[0]),
        );

        cy.log(
          "should not show a panel for a single fully-displayed comparison",
        );
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

const scalarContainer = () => cy.findByTestId("scalar-container");
const previousValue = () => cy.findByTestId("scalar-previous-value");

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
