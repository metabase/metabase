import {
  editDashboard,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

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
          cy.log(`Checking default sizes for ${card.display} card`);
          const { width, height } = getDefaultSize(card.display);
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
          dashCard.within(() => {
            const resizeHandle = cy.get(".react-resizable-handle");
            resizeHandle
              .trigger("mousedown", { button: 0 })
              .trigger("mousemove", {
                clientX: getDefaultSize(card.display).width * 100,
                clientY: getDefaultSize(card.display).height * 100,
              })
              .trigger("mouseup", { force: true });
          });
        });

        saveDashboard();
        editDashboard();

        orderedCards.forEach(({ card }) => {
          const dashCard = cy.contains(".DashCard", card.name);
          dashCard.within(() => {
            const resizeHandle = cy.get(".react-resizable-handle");
            resizeHandle
              .trigger("mousedown", { button: 0 })
              .trigger("mousemove", {
                clientX: -getDefaultSize(card.display).width * 100,
                clientY: -getDefaultSize(card.display).height * 100,
              })
              .trigger("mouseup", { force: true });
          });
        });

        saveDashboard();

        cy.request("GET", `/api/dashboard/${dashId}`).then(({ body }) => {
          body.ordered_cards.forEach(({ card, size_x, size_y }) => {
            cy.log(`Checking min sizes for ${card.display} card`);
            expect(size_x).to.equal(getMinSize(card.display).width);
            expect(size_y).to.equal(getMinSize(card.display).height);
          });
        });
      });
    });
  });
});
