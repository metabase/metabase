import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createDashboardWithTabs,
  createQuestion,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import type { CardId } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TAB_QUESTIONS = { id: 1, name: "Questions" };

const TAB_MODELS = { id: 2, name: "Models" };

function createBaseQuestions() {
  createQuestion({
    name: "Q0 Orders",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(({ body: q0 }) => {
    cy.wrap(q0).as("q0");

    createQuestion({
      name: "Q1 Orders question",
      query: {
        "source-table": `card__${q0.id}`,
      },
    }).then(({ body: q1 }) => {
      cy.wrap(q1).as("q1");
    });

    createQuestion({
      name: "M1 Orders model",
      type: "model",
      query: {
        "source-table": `card__${q0.id}`,
      },
    }).then(({ body: m1 }) => {
      cy.wrap(m1).as("m1");
    });
  });
}

function createDashboard({
  questions,
  models,
}: {
  questions: {
    questionBased: CardId[];
    modelBased: CardId[];
  };
  models: {
    questionBased: CardId[];
    modelBased: CardId[];
  };
}) {
  let id = 0;
  const getNextId = () => --id;
  const QUESTION_BASED_COLUMN = 0;
  const MODEL_BASED_COLUMN = 12;
  const CARD_HEIGHT = 4;

  createDashboardWithTabs({
    tabs: [TAB_QUESTIONS, TAB_MODELS],
    dashcards: [
      ...questions.questionBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_QUESTIONS.id,
        size_x: 12,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: QUESTION_BASED_COLUMN,
        card_id: id,
      })),
      ...questions.modelBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_QUESTIONS.id,
        size_x: 12,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: MODEL_BASED_COLUMN,
        card_id: id,
      })),
      ...models.questionBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_MODELS.id,
        size_x: 12,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: QUESTION_BASED_COLUMN,
        card_id: id,
      })),
      ...models.modelBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_MODELS.id,
        size_x: 12,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: MODEL_BASED_COLUMN,
        card_id: id,
      })),
    ],
  }).then(dashboard => visitDashboard(dashboard.id));
}

/**
 * "Questions" tab - dashcards are questions
 * "Models" tab - dashcards are models
 *
 * Left column (col = 0): data source is a question
 * Right column (col = 12): data source is a model
 */
describe("scenarios > dashboard > filters > query stages", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    // cy.intercept("POST", "/api/dataset").as("dataset");

    createBaseQuestions();
  });

  it("1 stage questions", () => {
    createDashboard({
      questions: {
        questionBased: [],
        modelBased: [],
      },
      models: {
        questionBased: [],
        modelBased: [],
      },
    });
  });
});
