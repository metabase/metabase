import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createDashboardWithTabs,
  createQuestion,
  editDashboard,
  getDashboardCard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import type { Card, ConcreteFieldReference } from "metabase-types/api";

const { ORDERS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

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

const TOTAL_FIELD: ConcreteFieldReference = [
  "field",
  "TOTAL",
  {
    "base-type": "type/Float",
  },
];

const TAX_FIELD: ConcreteFieldReference = [
  "field",
  "TAX",
  {
    "base-type": "type/Float",
  },
];

const PRODUCT_ID_FIELD: ConcreteFieldReference = [
  "field",
  "PRODUCT_ID",
  {
    "base-type": "type/Float",
  },
];

/**
 * "Questions" tab - dashcards are questions
 * "Models" tab - dashcards are models
 *
 * Left column (col = 0): data source is a question
 * Right column (col = 12): data source is a model
 *
 * q = question, m = model
 * qb = question-based, mb = model-based
 */
describe("scenarios > dashboard > filters > query stages", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQ0("q0");
    cy.then(function () {
      createQ1("q1", this.q0);
      createM1("m1", this.q0);
    });
  });

  describe("base queries", () => {
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

    it("allows to map to all relevant columns", () => {
      editDashboard();

      cy.log("date columns");
      getFilter("Date").click();
      verifyDashcardMappingOptions(0, [
        ["Order", ["Created At"]],
        ["Product", ["Created At"]],
        ["User", ["Birth Date", "Created At"]],
      ]);
      verifyDashcardMappingOptions(1, [
        ["M1 Model based on a question", ["Created At"]],
        ["Product", ["Created At"]],
        ["User", ["Birth Date", "Created At"]],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Q0 Order", ["Created At"]],
        ["Product", ["Created At"]],
        ["User", ["Birth Date", "Created At"]],
      ]);

      cy.log("text columns");
      getFilter("Text").click();
      verifyDashcardMappingOptions(0, [
        ["Product", ["Ean", "Title", "Category", "Vendor"]],
        ["User", ["Address", "Email", "Password", "Name", "Source"]],
      ]);
      verifyDashcardMappingOptions(1, [
        ["Product", ["Ean", "Title", "Category", "Vendor"]],
        ["User", ["Address", "Email", "Password", "Name", "Source"]],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Product", ["Ean", "Title", "Category", "Vendor"]],
        ["User", ["Address", "Email", "Password", "Name", "Source"]],
      ]);

      cy.log("number columns");
      getFilter("Number").click();
      verifyDashcardMappingOptions(0, [
        ["Order", ["Subtotal", "Tax", "Total", "Discount", "Quantity"]],
        ["Product", ["Price", "Rating"]],
        ["User", ["Longitude", "Latitude"]],
      ]);
      verifyDashcardMappingOptions(1, [
        [
          "M1 Model based on a question",
          ["Subtotal", "Tax", "Total", "Discount", "Quantity"],
        ],
        ["Product", ["Price", "Rating"]],
        ["User", ["Longitude", "Latitude"]],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Q0 Order", ["Subtotal", "Tax", "Total", "Discount", "Quantity"]],
        ["Product", ["Price", "Rating"]],
        ["User", ["Longitude", "Latitude"]],
      ]);
    });
  });

  describe("1-stage queries", () => {
    beforeEach(() => {
      cy.then(function () {
        createQ2("q2qb", this.q1, {
          type: "question",
          name: "Q2 - Question-based question",
        });
        createQ2("q2mb", this.m1, {
          type: "question",
          name: "Q2 - Model-based question",
        });
        createQ2("m2qb", this.q1, {
          type: "model",
          name: "M2 - Question-based model",
        });
        createQ2("m2mb", this.m1, {
          type: "model",
          name: "M2 - Model-based model",
        });
      });

      cy.then(function () {
        createTestDashboard({
          questions: {
            questionBased: [this.q2qb],
            modelBased: [this.q2mb],
          },
          models: {
            questionBased: [this.m2qb],
            modelBased: [this.m2mb],
          },
        }).then(dashboard => visitDashboard(dashboard.id));
      });
    });

    it("allows to map to all relevant columns", () => {});
  });
});

function createQ0(alias: string) {
  return createQuestion({
    name: "Q0 Orders",
    description: "Plain Orders table",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(response => cy.wrap(response.body).as(alias));
}

function createQ1(alias: string, source: Card) {
  return createQuestion({
    name: "Q1 Orders question",
    description: "Question based on a question",
    query: {
      "source-table": `card__${source.id}`,
    },
  }).then(response => cy.wrap(response.body).as(alias));
}

function createM1(alias: string, source: Card) {
  return createQuestion({
    name: "M1 Orders Model",
    description: "Model based on a question",
    type: "model",
    query: {
      "source-table": `card__${source.id}`,
    },
  }).then(response => cy.wrap(response.body).as(alias));
}

function createQ2(
  alias: string,
  source: Card,
  questionDetails?: Partial<StructuredQuestionDetails>,
) {
  return createQuestion({
    query: {
      "source-table": `card__${source.id}`,
      expressions: {
        Net: ["-", TOTAL_FIELD, TAX_FIELD],
      },
      joins: [
        {
          fields: "all",
          strategy: "left-join",
          alias: "Reviews - Product",
          condition: [
            "=",
            PRODUCT_ID_FIELD,
            [
              "field",
              "PRODUCT_ID",
              {
                "base-type": "type/Integer",
                "join-alias": "Reviews - Product",
              },
            ],
          ],
          "source-table": REVIEWS_ID,
        },
      ],
    },
    ...questionDetails,
  }).then(response => cy.wrap(response.body).as(alias));
}

function createTestDashboard({
  questions,
  models,
}: {
  questions: {
    questionBased: Card[];
    modelBased: Card[];
  };
  models: {
    questionBased: Card[];
    modelBased: Card[];
  };
}) {
  let id = 0;
  const getNextId = () => --id;

  return createDashboardWithTabs({
    tabs: [TAB_QUESTIONS, TAB_MODELS],
    parameters: [DATE_PARAMETER, TEXT_PARAMETER, NUMBER_PARAMETER],
    dashcards: [
      ...questions.questionBased.map((card, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_QUESTIONS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: QUESTION_BASED_COLUMN,
        card,
        card_id: card.id,
      })),
      ...questions.modelBased.map((card, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_QUESTIONS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: MODEL_BASED_COLUMN,
        card,
        card_id: card.id,
      })),
      ...models.questionBased.map((card, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_MODELS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: QUESTION_BASED_COLUMN,
        card,
        card_id: card.id,
      })),
      ...models.modelBased.map((card, index) => ({
        id: getNextId(),
        dashboard_tab_id: TAB_MODELS.id,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: CARD_HEIGHT * index,
        col: MODEL_BASED_COLUMN,
        card,
        card_id: card.id,
      })),
    ],
  });
}

function getFilter(name: string) {
  return cy.findByTestId("fixed-width-filters").findByText(name);
}

function getPopoverItems() {
  return cy.get("[data-element-id=list-section]");
}

function clickAway() {
  cy.get("body").click(0, 0);
}

function verifyDashcardMappingOptions(
  dashcardIndex: number,
  sections: MappingSection[],
) {
  getDashboardCard(dashcardIndex).findByText("Select…").click();
  verifyPopoverMappingOptions(sections);
  clickAway();
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
