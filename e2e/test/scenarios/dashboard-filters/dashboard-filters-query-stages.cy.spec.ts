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

    createQ0().then(({ body: q0 }) => {
      createQ1(q0.id);
      createM1(q0.id);
    });
  });

  it("base questions", () => {
    cy.then(function () {
      createDashboard({
        questions: {
          questionBased: [this.question0Id, this.question1Id, this.model1Id],
          modelBased: [],
        },
        models: {
          questionBased: [],
          modelBased: [],
        },
      });
    });
  });
});

function createQ0() {
  return createQuestion(
    {
      name: "Q0 Orders",
      description: "Plain Orders table",
      query: {
        "source-table": ORDERS_ID,
      },
    },
    { idAlias: "question0Id" },
  );
}

function createQ1(q0Id: CardId) {
  return createQuestion(
    {
      name: "Q1 Orders question",
      description: "Question based on a question",
      query: {
        "source-table": `card__${q0Id}`,
      },
    },
    { idAlias: "question1Id" },
  );
}

function createM1(q0Id: CardId) {
  return createQuestion(
    {
      name: "Model based on a question",
      type: "model",
      query: {
        "source-table": `card__${q0Id}`,
      },
    },
    { idAlias: "model1Id" },
  );
}

// TODO: tests for base questions q0 q1 m1
// TODO: create questions for 1 stage
// TODO: create questions for 2 stages
// TODO: create question for 3 stages

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
