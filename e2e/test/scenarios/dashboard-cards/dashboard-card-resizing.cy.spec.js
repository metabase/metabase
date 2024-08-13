import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  getDashboardCard,
  popover,
  resizeDashboardCard,
  restore,
  saveDashboard,
  visitDashboard,
  createQuestion,
  createDashboard,
} from "e2e/support/helpers";
import { GRID_WIDTH } from "metabase/lib/dashboard_grid";

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

const getMinSize = visualizationType =>
  _.get(VISUALIZATION_SIZES, [visualizationType, "min"], undefined);
const getDefaultSize = visualizationType =>
  _.get(VISUALIZATION_SIZES, [visualizationType, "default"], undefined);

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const getMockQuestionName = vizType => `MOCK_${vizType}_QUESTION`;

const getCommonQuestionFields = vizType => ({
  name: getMockQuestionName(vizType),
  query: {
    "source-table": ORDERS_ID,
    limit: 10,
    aggregation: [["count"]],
  },
  database: SAMPLE_DB_ID,
});

// covers table, bar, line, pie, row, area, combo, pivot, funnel, detail, and waterfall questions
const createMockChartQuestion = vizType => {
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
        Object.keys(ORDERS).find(key => ORDERS[key] === ORDERS.CREATED_AT),
      ],
      "graph.series_order_dimension": null,
      "graph.series_order": null,
      "graph.metrics": ["count"],
    },
  };
};

// covers scalar, gauge, and progress questions
const createMockScalarQuestion = vizType => {
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
  ].map(vizType => createMockChartQuestion(vizType)),
  ...["scalar", "gauge", "progress"].map(vizType =>
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
      restore();
      cy.signInAsAdmin();
    });

    it("should display all visualization cards with their default sizes", () => {
      TEST_QUESTIONS.forEach(question => {
        createQuestion(question);
      });
      createDashboard().then(({ body: { id: dashId } }) => {
        visitDashboard(dashId);

        cy.findByTestId("dashboard-header").within(() => {
          cy.findByLabelText("Edit dashboard").click();
          cy.findByLabelText("Add questions").click();
        });

        /**
         * Metabase sorts all questions in the sidebar alphabetically.
         * It makes sense to sort them out here as well in order to avoid
         * Cypress "jumping" up and down while clicking on them.
         * It will go in order from top to the bottom, which scrolls the
         * sidebar naturally. This prevents acting on an element that's not visible.
         */
        const sortedCards = TEST_QUESTIONS.sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        /**
         * After each card is added to the dashboard from the sidebar, there is a
         * request to load the card query. We need to wait for each of those before
         * we attempt to add a new card. Otherwise the save dashboard might fail
         * because Cypress is too fast.
         */
        cy.intercept("POST", "/api/card/**/query").as("cardQuery");
        sortedCards.forEach(question => {
          cy.findByLabelText(question.name).should("be.visible").click();
          cy.wait("@cardQuery");
        });

        saveDashboard();

        cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
          body.dashcards.forEach(({ card, size_x, size_y }) => {
            const { height, width } = getDefaultSize(card.display);
            expect(size_x).to.equal(width);
            expect(size_y).to.equal(height);
          });
        });
      });
    });

    it("should not allow cards to be resized smaller than min height", () => {
      const cardIds = [];
      TEST_QUESTIONS.forEach(question => {
        createQuestion(question).then(({ body: { id } }) => {
          cardIds.push(id);
        });
      });
      createDashboard().then(({ body: { id: dashId } }) => {
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
        visitDashboard(dashId);
        editDashboard();

        cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
          body.dashcards.forEach(({ card }, index) => {
            resizeDashboardCard({
              card: getDashboardCard(index),
              x: -getDefaultSize(card.display).width * 200,
              y: -getDefaultSize(card.display).height * 200,
            });
          });

          saveDashboard();

          cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
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
  const entityCard = () => getDashboardCard(0);
  const customCard = () => getDashboardCard(1);

  const editEntityLinkContainer = () =>
    cy.findByTestId("entity-edit-display-link");
  const editCustomLinkContainer = () =>
    cy.findByTestId("custom-edit-text-link");

  const viewEntityLinkContainer = () =>
    cy.findByTestId("entity-view-display-link");
  const viewCustomLinkContainer = () =>
    cy.findByTestId("custom-view-text-link");

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestion({
      name: TEST_QUESTION_NAME,
      query: {
        "source-table": ORDERS_ID,
      },
    });

    createDashboard({
      name: TEST_DASHBOARD_NAME,
    }).then(({ body: { id: dashId } }) => {
      visitDashboard(dashId);
    });

    editDashboard();

    cy.log("Add first link card (connected to an entity");
    cy.findByLabelText("Add link card").click();
    getDashboardCard(0).as("entityCard").click().type(TEST_QUESTION_NAME);
    popover()
      .findAllByTestId("search-result-item-name")
      .first()
      .trigger("click");

    cy.log("Add second link card (text only)");
    cy.findByLabelText("Add link card").click();
    getDashboardCard(1)
      .as("customCard")
      .click()
      .type(TEST_QUESTION_NAME)
      .realPress("Tab");
  });

  it("should prevent link dashboard card overflows (metabase#31701)", () => {
    cy.log("when editing dashboard");
    viewports.forEach(([width, height]) => {
      cy.log(`Testing on resolution ${width} x ${height}`);
      cy.viewport(width, height);

      assertLinkCardOverflow(editEntityLinkContainer(), entityCard());
      assertLinkCardOverflow(editCustomLinkContainer(), customCard());
    });

    saveDashboard();

    cy.log("when viewing a saved dashboard");
    viewports.forEach(([width, height]) => {
      cy.log(`Testing on resolution ${width} x ${height}`);
      cy.viewport(width, height);

      assertLinkCardOverflow(viewEntityLinkContainer(), entityCard());
      assertLinkCardOverflow(viewCustomLinkContainer(), customCard());
    });
  });
});

const assertLinkCardOverflow = (link, card) => {
  link.then(linkElem => {
    card.then(dashCardElem => {
      expect(linkElem[0].scrollHeight).to.eq(dashCardElem[0].scrollHeight);
    });
  });
};
