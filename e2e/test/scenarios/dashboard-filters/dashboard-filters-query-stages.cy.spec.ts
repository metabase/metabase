import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createDashboardWithTabs,
  createQuestion,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import type { CardId } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TAB_QUESTIONS = { id: 1, name: "Questions" };

const TAB_MODELS = { id: 2, name: "Models" };

const CARD_HEIGHT = 4;

const CARD_WIDTH = 12;

const QUESTION_BASED_COLUMN = 0;

const MODEL_BASED_COLUMN = CARD_WIDTH;

const DATE_PARAMETER = {
  name: "Date",
  slug: "date",
  id: "717a5624",
  type: "date/all-options",
  sectionId: "date",
};

const TEXT_PARAMETER = {
  name: "Text",
  slug: "text",
  id: "76817b51",
  type: "string/=",
  sectionId: "string",
};

const NUMBER_PARAMETER = {
  name: "Number",
  slug: "number",
  id: "f5944ad9",
  type: "number/=",
  sectionId: "number",
};

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

    createQ0();
    cy.then(function () {
      createQ1(this.q0.id);
      createM1(this.q0.id);
    });
  });

  describe("base questions", () => {
    beforeEach(() => {
      cy.then(function () {
        createDashboardWithTabs({
          parameters: [DATE_PARAMETER, TEXT_PARAMETER, NUMBER_PARAMETER],
          dashcards: [
            {
              id: -1,
              size_x: CARD_WIDTH,
              size_y: CARD_HEIGHT,
              row: 0,
              col: QUESTION_BASED_COLUMN,
              card_id: this.q0.id,
              card: this.q0,
            },
            {
              id: -2,
              size_x: CARD_WIDTH,
              size_y: CARD_HEIGHT,
              row: CARD_HEIGHT,
              col: QUESTION_BASED_COLUMN,
              card_id: this.q1.id,
              card: this.q1,
            },
            {
              id: -3,
              size_x: CARD_WIDTH,
              size_y: CARD_HEIGHT,
              row: 0,
              col: MODEL_BASED_COLUMN,
              card_id: this.m1.id,
              card: this.m1,
            },
          ],
        }).then(dashboard => visitDashboard(dashboard.id));
      });
    });

    it("allows to map all columns", () => {
      editDashboard();

      cy.log("date columns");
      getFilter("Date").click();

      verifyDashcardMappingOptions(0, [
        ["Order", ["Created At"]],
        ["Product", ["Created At"]],
        ["User", ["Birth Date", "Created At"]],
      ]);
      verifyDashcardMappingOptions(1, [
        ["Model based on a question", ["Created At"]],
        ["Product", ["Created At"]],
        ["User", ["Birth Date", "Created At"]],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Q0 Order", ["Created At"]],
        ["Product", ["Created At"]],
        ["User", ["Birth Date", "Created At"]],
      ]);

      // cy.log("text columns");
      // getFilter("Text").click();

      // cy.log("number columns");
      // getFilter("Number").click();
    });
  });
});

function verifyDashcardMappingOptions(
  dashcardIndex: number,
  sections: MappingSection[],
) {
  getDashboardCard(dashcardIndex).findByText("Select…").click();
  verifyPopoverMappingOptions(sections);
  cy.realPress("Escape");
}

type SectionName = string;
type ColumnName = string;
type MappingSection = [SectionName, ColumnName[]];

function verifyPopoverMappingOptions(sections: MappingSection[]) {
  popover().within(() => {
    let index = 0;

    for (const [sectionName, columnNames] of sections) {
      getPopoverItems().eq(index).should("have.text", sectionName);
      ++index;

      for (const columnName of columnNames) {
        getPopoverItems()
          .eq(index)
          .findByLabelText(columnName)
          .should("be.visible");
        ++index;
      }
    }
  });
}

function getPopoverItems() {
  return cy.get("[data-element-id=list-section]");
}

function createQ0() {
  return createQuestion({
    name: "Q0 Orders",
    description: "Plain Orders table",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(response => {
    cy.wrap(response.body).as("q0");
  });
}

function createQ1(q0Id: CardId) {
  return createQuestion({
    name: "Q1 Orders question",
    description: "Question based on a question",
    query: {
      "source-table": `card__${q0Id}`,
    },
  }).then(response => {
    cy.wrap(response.body).as("q1");
  });
}

function createM1(q0Id: CardId) {
  return createQuestion({
    name: "Model based on a question",
    type: "model",
    query: {
      "source-table": `card__${q0Id}`,
    },
  }).then(response => {
    cy.wrap(response.body).as("m1");
  });
}

// TODO: tests for base questions q0 q1 m1
// TODO: create questions for 1 stage
// TODO: create questions for 2 stages
// TODO: create question for 3 stages

function createTestDashboard({
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

  return createDashboardWithTabs({
    tabs: [TAB_QUESTIONS, TAB_MODELS],
    dashcards: [
      ...questions.questionBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_QUESTIONS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: QUESTION_BASED_COLUMN,
        card_id: id,
      })),
      ...questions.modelBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_QUESTIONS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: MODEL_BASED_COLUMN,
        card_id: id,
      })),
      ...models.questionBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_MODELS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: QUESTION_BASED_COLUMN,
        card_id: id,
      })),
      ...models.modelBased.map((id, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_MODELS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: MODEL_BASED_COLUMN,
        card_id: id,
      })),
    ],
  });
}

function getFilter(name: string) {
  return cy.findByTestId("fixed-width-filters").findByText(name);
}
