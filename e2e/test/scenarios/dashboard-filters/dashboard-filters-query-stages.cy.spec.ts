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
import type {
  Card,
  ConcreteFieldReference,
  StructuredQuery,
} from "metabase-types/api";

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

const ORDERS_DATE_COLUMNS = ["Created At"];
const ORDERS_NUMBER_COLUMNS = [
  "Subtotal",
  "Tax",
  "Total",
  "Discount",
  "Quantity",
];
const PRODUCTS_DATE_COLUMNS = ["Created At"];
const PRODUCTS_TEXT_COLUMNS = ["Ean", "Title", "Category", "Vendor"];
const PRODUCTS_NUMBER_COLUMNS = ["Price", "Rating"];

const PEOPLE_DATE_COLUMNS = ["Birth Date", "Created At"];
const PEOPLE_TEXT_COLUMNS = ["Address", "Email", "Password", "Name", "Source"];
const PEOPLE_NUMBER_COLUMNS = ["Longitude", "Latitude"];

const REVIEWS_DATE_COLUMNS = ["Created At"];
const REVIEWS_TEXT_COLUMNS = ["Reviewer", "Body"];
const REVIEWS_NUMBER_COLUMNS = ["Rating"];

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
      createQ1("q1", this.q0, {
        type: "question",
        name: "Q1 Orders Question",
        description: "Question based on a question",
      });
      createQ1("m1", this.q0, {
        type: "model",
        name: "M1 Orders Model",
        description: "Model based on a question",
      });
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
        ["Order", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
      verifyDashcardMappingOptions(1, [
        ["M1 Orders Model", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Q0 Order", ORDERS_DATE_COLUMNS],
        ["Product", PRODUCTS_DATE_COLUMNS],
        ["User", PEOPLE_DATE_COLUMNS],
      ]);

      cy.log("text columns");
      getFilter("Text").click();
      verifyDashcardMappingOptions(0, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
      verifyDashcardMappingOptions(1, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Product", PRODUCTS_TEXT_COLUMNS],
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);

      cy.log("number columns");
      getFilter("Number").click();
      verifyDashcardMappingOptions(0, [
        ["Order", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
      verifyDashcardMappingOptions(1, [
        ["M1 Orders Model", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
      verifyDashcardMappingOptions(2, [
        ["Q0 Order", ORDERS_NUMBER_COLUMNS],
        ["Product", PRODUCTS_NUMBER_COLUMNS],
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
    });
  });

  describe("1-stage queries", () => {
    beforeEach(() => {
      cy.then(function () {
        createQ2("q2qb", this.q1, {
          type: "question",
          name: "Q2 - Question-based Question",
        });
        createQ2("q2mb", this.m1, {
          type: "question",
          name: "Q2 - Model-based Question",
        });
        createQ2("m2qb", this.q1, {
          type: "model",
          name: "M2 - Question-based Model",
        });
        createQ2("m2mb", this.m1, {
          type: "model",
          name: "M2 - Model-based Model",
        });

        createQ2("q3qb", this.q1, {
          type: "question",
          name: "Q3 - Question-based Question",
        });
        createQ3("q3mb", this.m1, {
          type: "question",
          name: "Q3 - Model-based Question",
        });
        createQ3("m3qb", this.q1, {
          type: "model",
          name: "M3 - Question-based Model",
        });
        createQ3("m3mb", this.m1, {
          type: "model",
          name: "M3 - Model-based Model",
        });
      });

      cy.then(function () {
        createTestDashboard({
          questions: {
            questionBased: [this.q2qb, this.q3qb],
            modelBased: [this.q2mb, this.q3mb],
          },
          models: {
            questionBased: [this.m2qb, this.m3qb],
            modelBased: [this.m2mb, this.m3mb],
          },
        }).then(dashboard => visitDashboard(dashboard.id));
      });
    });

    it("allows to map to all relevant columns", () => {
      editDashboard();

      cy.log("# questions");
      verifyQuestions();

      cy.findByRole("tab", { name: "Models" }).click();

      cy.log("# models");
      verifyModels();

      function verifyQuestions() {
        cy.log("## date columns");
        getFilter("Date").click();
        verifyDashcardMappingOptions(0, [
          ["Q1 Orders Question", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["M1 Orders Model", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          ["Q1 Orders Question", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(3, [
          ["M1 Orders Model", ORDERS_DATE_COLUMNS],
          ["Review", REVIEWS_DATE_COLUMNS],
          ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_DATE_COLUMNS],
        ]);

        cy.log("## text columns");
        getFilter("Text").click();
        verifyDashcardMappingOptions(0, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(3, [
          ["Review", REVIEWS_TEXT_COLUMNS],
          ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);

        cy.log("## number columns");
        getFilter("Number").click();
        verifyDashcardMappingOptions(0, [
          ["Q1 Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          ["M1 Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(2, [
          ["Q1 Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(3, [
          ["M1 Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
          ["Review", REVIEWS_NUMBER_COLUMNS],
          ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // https://github.com/metabase/metabase/issues/46845
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
      }

      function verifyModels() {
        cy.log("## date columns");
        getFilter("Date").click();
        verifyDashcardMappingOptions(0, [
          [
            "M2 - Question-based Model",
            [...ORDERS_DATE_COLUMNS, "Reviews - Product → Created At"],
          ],
          ["Product", PRODUCTS_DATE_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_DATE_COLUMNS],
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          [
            "M2 - Model-based Model",
            [...ORDERS_DATE_COLUMNS, "Reviews - Product → Created At"],
          ],
          ["Product", PRODUCTS_DATE_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_DATE_COLUMNS],
          ["User", PEOPLE_DATE_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);

        cy.log("## text columns");
        getFilter("Text").click();
        verifyDashcardMappingOptions(0, [
          [
            "M2 - Question-based Model",
            ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
          ],
          ["Product", PRODUCTS_TEXT_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_TEXT_COLUMNS],
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          [
            "M2 - Model-based Model",
            ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
          ],
          ["Product", PRODUCTS_TEXT_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_TEXT_COLUMNS],
          ["User", PEOPLE_TEXT_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);

        cy.log("## number columns");
        getFilter("Number").click();
        verifyDashcardMappingOptions(0, [
          [
            "M2 - Question-based Model",
            [...ORDERS_NUMBER_COLUMNS, "Reviews - Product → Rating"],
          ],
          ["Product", PRODUCTS_NUMBER_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_NUMBER_COLUMNS],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyDashcardMappingOptions(1, [
          [
            "M2 - Model-based Model",
            [...ORDERS_NUMBER_COLUMNS, "Reviews - Product → Rating"],
          ],
          ["Product", PRODUCTS_NUMBER_COLUMNS],
          ["Reviews - Product → Product", PRODUCTS_NUMBER_COLUMNS],
          ["User", PEOPLE_NUMBER_COLUMNS],
        ]);
        verifyNoDashcardMappingOptions(2);
        verifyNoDashcardMappingOptions(3);
      }
    });
  });
});

function createQ0(alias: string) {
  return createQuestion({
    name: "Q0 Orders",
    description: "Question based on a database table",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(response => cy.wrap(response.body).as(alias));
}

function createQ1(
  alias: string,
  source: Card,
  questionDetails?: Partial<StructuredQuestionDetails>,
) {
  return createQuestion({
    query: createQ1uery(source),
    ...questionDetails,
  }).then(response => cy.wrap(response.body).as(alias));
}

function createQ2(
  alias: string,
  source: Card,
  questionDetails?: Partial<StructuredQuestionDetails>,
) {
  return createQuestion({
    description: "join, custom column, no aggregations, no breakouts",
    query: createQ2Query(source),
    ...questionDetails,
  }).then(response => cy.wrap(response.body).as(alias));
}

function createQ3(
  alias: string,
  source: Card,
  questionDetails?: Partial<StructuredQuestionDetails>,
) {
  return createQuestion({
    description: "join, custom column, aggregations, no breakouts",
    query: createQ3Query(source),
    ...questionDetails,
  }).then(response => cy.wrap(response.body).as(alias));
}

function createQ1uery(source: Card): StructuredQuery {
  return {
    "source-table": `card__${source.id}`,
  };
}

function createQ2Query(source: Card): StructuredQuery {
  return {
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
  };
}

function createQ3Query(source: Card): StructuredQuery {
  return {
    ...createQ2Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
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

function verifyNoDashcardMappingOptions(dashcardIndex: number) {
  getDashboardCard(dashcardIndex)
    .findByText("No valid fields")
    .should("be.visible");

  getDashboardCard(dashcardIndex).findByText("No valid fields").realHover();
  cy.findByRole("tooltip")
    .findByText(
      "This card doesn't have any fields or parameters that can be mapped to this parameter type.",
    )
    .should("be.visible");
}

type SectionName = string;
type ColumnName = string;
type MappingSection = [SectionName, ColumnName[]];

function verifyPopoverMappingOptions(sections: MappingSection[]) {
  popover().within(() => {
    getPopoverItems().then($items => {
      let index = 0;

      for (const [sectionName, columnNames] of sections) {
        const item = cy.wrap($items[index]);
        item.scrollIntoView();
        item.should("have.text", sectionName);
        ++index;

        for (const columnName of columnNames) {
          const item = cy.wrap($items[index]);
          item.scrollIntoView();
          item.findByLabelText(columnName).should("be.visible");
          ++index;
        }
      }
    });
  });
}
