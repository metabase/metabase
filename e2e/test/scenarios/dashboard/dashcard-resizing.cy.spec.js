import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { GRID_WIDTH } from "metabase/utils/dashboard_grid";

const VISUALIZATION_SIZES = {
  line: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  area: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  bar: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  stacked: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  combo: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  row: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  scatter: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  waterfall: {
    min: { width: 4, height: 3 },
    default: { width: 14, height: 6 },
  },
  pie: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 8 },
  },
  funnel: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  gauge: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  progress: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  map: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 6 },
  },
  table: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 9 },
  },
  pivot: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 9 },
  },
  object: {
    min: { width: 4, height: 3 },
    default: { width: 12, height: 9 },
  },
  scalar: {
    min: { width: 2, height: 2 },
    default: { width: 6, height: 3 },
  },
  smartscalar: {
    min: { width: 2, height: 2 },
    default: { width: 6, height: 3 },
  },
  link: {
    min: { width: 1, height: 1 },
    default: { width: 8, height: 1 },
  },
  action: {
    min: { width: 1, height: 1 },
    default: { width: 4, height: 1 },
  },
  heading: {
    min: { width: 1, height: 1 },
    default: { width: GRID_WIDTH, height: 1 },
  },
  text: {
    min: { width: 1, height: 1 },
    default: { width: 12, height: 3 },
  },
};

const getMinSize = (visualizationType) =>
  _.get(VISUALIZATION_SIZES, [visualizationType, "min"], undefined);
const getDefaultSize = (visualizationType) =>
  _.get(VISUALIZATION_SIZES, [visualizationType, "default"], undefined);

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const getMockQuestionName = (vizType) => `MOCK_${vizType}_QUESTION`;

const getCommonQuestionFields = (vizType) => ({
  name: getMockQuestionName(vizType),
  query: {
    "source-table": ORDERS_ID,
    limit: 10,
    aggregation: [["count"]],
  },
  database: SAMPLE_DB_ID,
});

// covers table, bar, line, pie, row, area, combo, pivot, funnel, detail, and waterfall questions
const createMockChartQuestion = (vizType) => {
  const question = getCommonQuestionFields(vizType);
  return {
    ...question,
    query: {
      ...question.query,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "minute" }]],
    },
    display: vizType,
    visualization_settings: {
      "graph.dimensions": [
        Object.keys(ORDERS).find((key) => ORDERS[key] === ORDERS.CREATED_AT),
      ],
      "graph.series_order_dimension": null,
      "graph.series_order": null,
      "graph.metrics": ["count"],
    },
  };
};

// covers scalar, gauge, and progress questions
const createMockScalarQuestion = (vizType) => {
  const question = getCommonQuestionFields(vizType);
  return {
    ...question,
    display: vizType,
  };
};

// covers map questions
const createMockMapQuestion = () => {
  const question = getCommonQuestionFields("map");
  return {
    ...question,
    query: {
      ...question.query,
      breakout: [["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }]],
    },
    display: "map",
  };
};
const TEST_QUESTIONS = [
  ...[
    "table",
    "bar",
    "line",
    "pie",
    "row",
    "area",
    "combo",
    "pivot",
    "scatter",
    "funnel",
    "object",
    "smartscalar",
    "waterfall",
  ].map((vizType) => createMockChartQuestion(vizType)),
  ...["scalar", "gauge", "progress"].map((vizType) =>
    createMockScalarQuestion(vizType),
  ),
  createMockMapQuestion(),
];

const TEST_DASHBOARD_NAME = "Test Dashboard";
const TEST_QUESTION_NAME = "Test Question";

const viewports = [
  [768, 800],
  [1024, 800],
  [1440, 800],
];

describe(
  "scenarios > dashboard card resizing",
  { requestTimeout: 15000 },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should display all visualization cards with their default sizes", () => {
      TEST_QUESTIONS.forEach((question) => {
        H.createQuestion(question);
      });
      H.createDashboard().then(({ body: { id: dashId } }) => {
        H.visitDashboard(dashId);

        H.editDashboard();
        H.openQuestionsSidebar();

        /**
         * Metabase sorts all questions in the sidebar alphabetically.
         * It makes sense to sort them out here as well in order to avoid
         * Cypress "jumping" up and down while clicking on them.
         * It will go in order from top to the bottom, which scrolls the
         * sidebar naturally. This prevents acting on an element that's not visible.
         */
        const sortedCards = TEST_QUESTIONS.toSorted((a, b) =>
          a.name.localeCompare(b.name),
        );

        /**
         * After each card is added to the dashboard from the sidebar, there is a
         * request to load the card query. We need to wait for each of those before
         * we attempt to add a new card. Otherwise the save dashboard might fail
         * because Cypress is too fast.
         */
        cy.intercept("POST", "/api/card/**/query").as("cardQuery");
        sortedCards.forEach((question) => {
          cy.findByLabelText(question.name).should("be.visible").click();
          cy.wait("@cardQuery");
        });

        H.saveDashboard();

        cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
          expect(body.dashcards).to.have.length(TEST_QUESTIONS.length);
          body.dashcards.forEach(({ card, size_x, size_y }) => {
            const { height, width } = getDefaultSize(card.display);
            expect(size_x).to.equal(width);
            expect(size_y).to.equal(height);
          });
        });
      });
    });

    it("should keep the resize handle connected to the cursor while resizing (metabase#70451)", () => {
      H.createDashboardWithQuestions({
        dashboardDetails: {},
        questions: [
          {
            display: "table",
            query: {
              "source-table": ORDERS_ID,
              limit: 10,
            },
          },
        ],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });

      H.editDashboard();

      let targetX, targetY;

      H.getDashboardCard(0)
        .find(".react-resizable-handle")
        .then(($handle) => {
          const rect = $handle[0].getBoundingClientRect();
          const startX = Math.round(rect.left + rect.width / 2);
          const startY = Math.round(rect.top + rect.height / 2);
          targetX = startX + 200;
          targetY = startY + 150;

          // Not using the wrapper here because we want to avoid waits and we need the starting position for later
          cy.wrap($handle)
            .trigger("mousedown", {
              button: 0,
              clientX: startX,
              clientY: startY,
              force: true,
            })
            .trigger("mousemove", {
              clientX: targetX,
              clientY: targetY,
              force: true,
            });
        });

      // After dragging, the resize handle should still be near the cursor position.
      H.getDashboardCard(0)
        .find(".react-resizable-handle")
        .then(($handle) => {
          const rect = $handle[0].getBoundingClientRect();
          const handleCenterX = Math.round(rect.left + rect.width / 2);
          const handleCenterY = Math.round(rect.top + rect.height / 2);

          const maxDrift = 50;
          expect(
            Math.abs(handleCenterX - targetX),
            `Horizontal drift: handle at ${handleCenterX}, cursor at ${targetX}`,
          ).to.be.lessThan(maxDrift);
          expect(
            Math.abs(handleCenterY - targetY),
            `Vertical drift: handle at ${handleCenterY}, cursor at ${targetY}`,
          ).to.be.lessThan(maxDrift);
        });
    });

    it("should not allow cards to be resized smaller than min height", () => {
      const cardIds = [];
      TEST_QUESTIONS.forEach((question) => {
        H.createQuestion(question).then(({ body: { id } }) => {
          cardIds.push(id);
        });
      });
      H.createDashboard().then(({ body: { id: dashId } }) => {
        cy.request("PUT", `/api/dashboard/${dashId}`, {
          dashcards: cardIds.map((cardId, index) => ({
            id: index,
            card_id: cardId,
            row: index * 10,
            col: 0,
            size_x: 18,
            size_y: 10,
          })),
        });
        H.visitDashboard(dashId);
        H.editDashboard();

        cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
          body.dashcards.forEach(({ card }, index) => {
            H.resizeDashboardCard({
              card: H.getDashboardCard(index),
              x: -getDefaultSize(card.display).width * 200,
              y: -getDefaultSize(card.display).height * 200,
            });
          });

          H.saveDashboard();

          cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
            expect(body.dashcards).to.have.length(TEST_QUESTIONS.length);
            body.dashcards.forEach(({ card, size_x, size_y }) => {
              const { height, width } = getMinSize(card.display);
              expect(size_x).to.equal(width);
              expect(size_y).to.equal(height);
            });
          });
        });
      });
    });
  },
);

describe("issue 31701", () => {
  const entityCard = () => H.getDashboardCard(0);
  const customCard = () => H.getDashboardCard(1);

  const editEntityLinkContainer = "[data-testid='entity-edit-display-link']";
  const editCustomLinkContainer = "[data-testid='custom-edit-text-link']";

  const viewEntityLinkContainer = "[data-testid='entity-view-display-link']";
  const viewCustomLinkContainer = "[data-testid='custom-view-text-link']";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion({
      name: TEST_QUESTION_NAME,
      query: {
        "source-table": ORDERS_ID,
      },
    });
  });

  it("should prevent link dashboard card overflows (metabase#31701)", () => {
    H.createDashboard({
      name: TEST_DASHBOARD_NAME,
    }).then(({ body: { id: dashId } }) => {
      H.visitDashboard(dashId);
    });

    H.editDashboard();

    cy.log("Add first link card (connected to an entity");
    cy.findByLabelText("Add a link or iframe").click();
    H.popover().findByText("Link").click();
    H.getDashboardCard(0).as("entityCard").click().type(TEST_QUESTION_NAME);
    H.popover()
      .findAllByTestId("search-result-item-name")
      .first()
      .trigger("click");

    cy.log("Add second link card (text only)");
    cy.findByLabelText("Add a link or iframe").click();
    H.popover().findByText("Link").click();
    H.getDashboardCard(1)
      .as("customCard")
      .click()
      .type(TEST_QUESTION_NAME)
      .realPress("Tab");

    cy.log("when editing dashboard");
    viewports.forEach(([width, height]) => {
      cy.log(`Testing on resolution ${width} x ${height}`);
      cy.viewport(width, height);

      assertLinkCardOverflow(editEntityLinkContainer, entityCard());
      assertLinkCardOverflow(editCustomLinkContainer, customCard());
    });

    H.saveDashboard();

    cy.log("when viewing a saved dashboard");
    viewports.forEach(([width, height]) => {
      cy.log(`Testing on resolution ${width} x ${height}`);
      cy.viewport(width, height);

      assertLinkCardOverflow(viewEntityLinkContainer, entityCard());
      assertLinkCardOverflow(viewCustomLinkContainer, customCard());
    });
  });
});

const assertLinkCardOverflow = (link, card) => {
  card.should((dashCardElem) => {
    const linkElem = dashCardElem.find(link);
    expect(linkElem).to.have.length(1);
    expect(linkElem[0].scrollHeight).to.eq(
      dashCardElem[0].firstChild.scrollHeight,
    );
  });
};

describe("issue 29304", () => {
  // Couldn't import from `metabase/common/components/ExplicitSize` because dependency issue.
  // It will fail Cypress tests.
  const WAIT_TIME = 300;

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
    H.closeNavigationSidebar();
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
    cy.log("scalar 2x2: should keep the title visible without hovering");
    card("scalar2x2")
      .findByTestId("scalar-title")
      .should("contain", SCALAR_QUESTION.name)
      .and("be.visible");
    scalarContainer(card("scalar2x2")).realHover();
    cy.findByRole("tooltip").should("not.exist");
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
    cy.log("smart scalar 2x2: should keep the title visible without hovering");
    card("smart2x2")
      .findByTestId("scalar-title")
      .should("contain", SMART_SCALAR_QUESTION.name)
      .and("be.visible");
    scalarContainer(card("smart2x2")).realHover();
    cy.findByRole("tooltip").should("not.exist");
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
      card(key).icon("info").realHover();
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

describe("dashcard actions panel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);
  });

  it("should not clip dashcard actions and should not have redundant horizontal space (metabase#31274, metabase#76056)", () => {
    H.createDashboard().then(({ body: { id: dashboard_id } }) => {
      // The top card is created last, so it would come last in the DOM and
      // cover the actions of the card below if dashcards render in creation order
      H.updateDashboardCards({
        dashboard_id,
        cards: [H.getTextCardDetails({ row: 6, text: "Bottom card" })],
      }).then(({ body: { dashcards } }) => {
        H.updateDashboardCards({
          dashboard_id,
          cards: [
            ...dashcards,
            H.getTextCardDetails({ row: 0, text: "Top card" }),
          ],
        });
      });
      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    H.getDashboardCards().should("have.length", 2);

    cy.log(
      "Make sure cypress can click the element, which means it is not covered by the card above",
    );
    H.getDashboardCards()
      .filter(":contains('Bottom card')")
      .realHover({ scrollBehavior: false })
      .findByTestId("dashboardcard-actions-panel")
      .icon("close")
      .click({ position: "top", scrollBehavior: false });

    H.getDashboardCards().should("have.length", 1);
    H.removeDashboardCard(0);
    cy.findByTestId("dashcard").should("not.exist");

    cy.log(
      "The actions panel should not have redundant horizontal space (metabase#76056)",
    );
    cy.button("Add action").click();
    cy.button("Close").click();

    H.showDashboardCardActions();

    cy.findByTestId("dashboardcard-actions-panel")
      .should("be.visible")
      .should(($panel) => {
        const panelRect = $panel[0].getBoundingClientRect();
        const buttonRects = Array.from($panel[0].querySelectorAll("a")).map(
          (button) => button.getBoundingClientRect(),
        );
        const maxRight = Math.max(...buttonRects.map((rect) => rect.right));
        const minLeft = Math.min(...buttonRects.map((rect) => rect.left));
        const contentWidth = maxRight - minLeft;

        expect(panelRect.width).to.be.closeTo(contentWidth, 10);
      });

    H.removeDashboardCard(0);
    cy.findByTestId("dashcard").should("not.exist");

    cy.log("Remove an empty link card through its cross icon (metabase#31274)");
    cy.findByLabelText("Add a link or iframe").click();
    H.popover().findByText("Link").click();
    cy.findByPlaceholderText("https://example.com").realHover();
    H.getDashboardCards().should("have.length", 1);
    cy.log(
      "Make sure cypress can click the element, which means it is not covered by another",
    );
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("close").closest("a").click({ position: "bottom" });
    });
    cy.findByTestId("dashcard").should("not.exist");
  });
});
