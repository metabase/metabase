import _ from "underscore";
import {
  editDashboard,
  resizeDashboardCard,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    default: { width: 8, height: 6 },
  },
  funnel: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  gauge: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  progress: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
  },
  map: {
    min: { width: 4, height: 3 },
    default: { width: 8, height: 6 },
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
    min: { width: 1, height: 1 },
    default: { width: 4, height: 3 },
  },
  smartscalar: {
    min: { width: 2, height: 2 },
    default: { width: 4, height: 3 },
  },
  link: {
    min: { width: 1, height: 1 },
    default: { width: 4, height: 1 },
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
    default: { width: 6, height: 3 },
  },
};

const getMinSize = visualizationType =>
  _.get(VISUALIZATION_SIZES, [visualizationType, "min"], undefined);
const getDefaultSize = visualizationType =>
  _.get(VISUALIZATION_SIZES, [visualizationType, "default"], undefined);

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const getMockQuestionName = vizType => `${vizType}_MOCK_QUESTION`;

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
    "waterfall",
  ].map(vizType => createMockChartQuestion(vizType)),
  ...["scalar", "gauge", "progress"].map(vizType =>
    createMockScalarQuestion(vizType),
  ),
  createMockMapQuestion(),
];

describe("scenarios > dashboard card resizing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display all visualization cards with their default sizes", () => {
    TEST_QUESTIONS.forEach(question => {
      cy.createQuestion(question);
    });
    cy.createDashboard().then(({ body: { id: dashId } }) => {
      visitDashboard(dashId);

      cy.findByTestId("dashboard-header").within(() => {
        cy.findByLabelText("Edit dashboard").click();
        cy.findByLabelText("Add questions").click();
      });

      TEST_QUESTIONS.forEach(question => {
        cy.findByLabelText(question.name).click();
      });

      saveDashboard();

      cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
        body.ordered_cards.forEach(({ card, size_x, size_y }) => {
          const { height, width } = getDefaultSize(card.display);
          expect(size_x).to.equal(width);
          expect(size_y).to.equal(height);
        });
      });
    });
  });

  it(`should not allow cards to be resized smaller than min height`, () => {
    const cardIds = [];
    TEST_QUESTIONS.forEach(question => {
      cy.createQuestion(question).then(({ body: { id } }) => {
        cardIds.push(id);
      });
    });
    cy.createDashboard().then(({ body: { id: dashId } }) => {
      cy.request("PUT", `/api/dashboard/${dashId}/cards`, {
        cards: cardIds.map((cardId, index) => ({
          id: index,
          card_id: cardId,
          row: index * 2,
          col: 0,
          size_x: 2,
          size_y: 2,
        })),
      });
      visitDashboard(dashId);
      editDashboard();

      cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
        const orderedCards = body.ordered_cards;
        orderedCards.forEach(({ card }) => {
          const dashCard = cy.contains(".DashCard", card.name);
          resizeDashboardCard({
            card: dashCard,
            x: getDefaultSize(card.display).width * 100,
            y: getDefaultSize(card.display).height * 100,
          });
        });

        saveDashboard();
        editDashboard();

        orderedCards.forEach(({ card }) => {
          const dashCard = cy.contains(".DashCard", card.name);
          dashCard.within(() => {
            resizeDashboardCard({
              card: dashCard,
              x: -getDefaultSize(card.display).width * 200,
              y: -getDefaultSize(card.display).height * 200,
            });
          });
        });

        saveDashboard();

        cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
          body.ordered_cards.forEach(({ card, size_x, size_y }) => {
            const { height, width } = getMinSize(card.display);
            expect(size_x).to.equal(width);
            expect(size_y).to.equal(height);
          });
        });
      });
    });
  });
});
