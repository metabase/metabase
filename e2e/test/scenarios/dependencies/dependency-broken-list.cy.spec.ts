import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;
const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS } = SAMPLE_DATABASE;

const TABLE_BASED_QUESTION_BROKEN_FIELD =
  "Table-based question with broken field";
const TABLE_BASED_QUESTION_BROKEN_EXPRESSION =
  "Table-based question with broken expression";
const TABLE_BASED_QUESTION_BROKEN_FILTER =
  "Table-based question with broken filter";
const TABLE_BASED_QUESTION_BROKEN_BREAKOUT =
  "Table-based question with broken breakout";
const TABLE_BASED_QUESTION_BROKEN_AGGREGATION =
  "Table-based question with broken aggregation";
const TABLE_BASED_QUESTION_BROKEN_IMPLICIT_JOIN =
  "Table-based question with broken implicit join";
const TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN =
  "Table-based question with broken explicit join";
const TABLE_BASED_QUESTION = "Table-based question";
const QUESTION_BASED_QUESTION_BROKEN_FILTER =
  "Question-based question with broken filter";
const TABLE_BASED_MODEL = "Table-based model";
const MODEL_BASED_MODEL_BROKEN_AGGREGATION =
  "Model-based model with broken aggregation";

const BROKEN_TABLE_DEPENDENCIES = ["People", "Products", "Reviews"];
const BROKEN_TABLE_DEPENDENTS = [
  TABLE_BASED_QUESTION_BROKEN_FIELD,
  TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
  TABLE_BASED_QUESTION_BROKEN_FILTER,
  TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
  TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
  TABLE_BASED_QUESTION_BROKEN_IMPLICIT_JOIN,
  TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
];
const BROKEN_QUESTION_DEPENDENCIES = [TABLE_BASED_QUESTION];
const BROKEN_QUESTION_DEPENDENTS = [QUESTION_BASED_QUESTION_BROKEN_FILTER];
const BROKEN_MODEL_DEPENDENCIES = [TABLE_BASED_MODEL];
const BROKEN_MODEL_DEPENDENTS = [MODEL_BASED_MODEL_BROKEN_AGGREGATION];

const BROKEN_DEPENDENCIES = [
  ...BROKEN_TABLE_DEPENDENCIES,
  ...BROKEN_QUESTION_DEPENDENCIES,
  ...BROKEN_MODEL_DEPENDENCIES,
];

const BROKEN_DEPENDENCIES_SORTED_BY_NAME = [
  "People",
  "Products",
  "Reviews",
  TABLE_BASED_MODEL,
  TABLE_BASED_QUESTION,
];

const BROKEN_DEPENDENCIES_SORTED_BY_LOCATION = [
  TABLE_BASED_MODEL, // Bobby Tables's personal collection
  TABLE_BASED_QUESTION, // Our analytics
  "Products", // Sample database
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS = [
  "Products", // 3 errors: TOTAL, ID, RATING
  TABLE_BASED_QUESTION, // 1 error: PRICE
  TABLE_BASED_MODEL, // 1 error: AMOUNT
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS = [
  "Products", // 7 questions
  TABLE_BASED_QUESTION, // 1 question
  TABLE_BASED_MODEL, // 1 model
];

const BROKEN_DEPENDENTS = [
  ...BROKEN_TABLE_DEPENDENTS,
  ...BROKEN_QUESTION_DEPENDENTS,
  ...BROKEN_MODEL_DEPENDENTS,
];

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.viewport(1600, 1400);
  });

  describe("analysis", () => {
    it("should show broken dependencies and not dependents", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();
      checkList({
        visibleEntities: BROKEN_DEPENDENCIES,
        hiddenEntities: BROKEN_DEPENDENTS,
      });
    });
  });

  describe("sidebar", () => {
    it("should show broken dependents", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();

      cy.log("table dependents");
      H.DataStudio.Tasks.list().findByText("Products").click();
      checkSidebar({
        entityName: "Products",
        missingColumns: ["TOTAL", "ID", "RATING"],
        brokenDependents: BROKEN_TABLE_DEPENDENTS,
      });

      cy.log("question dependents");
      H.DataStudio.Tasks.list().findByText(TABLE_BASED_QUESTION).click();
      checkSidebar({
        entityName: TABLE_BASED_QUESTION,
        missingColumns: ["PRICE"],
        brokenDependents: BROKEN_QUESTION_DEPENDENTS,
      });

      cy.log("model dependents");
      H.DataStudio.Tasks.list().findByText(TABLE_BASED_MODEL).click();
      checkSidebar({
        entityName: TABLE_BASED_MODEL,
        missingColumns: ["AMOUNT"],
        brokenDependents: BROKEN_MODEL_DEPENDENTS,
      });
    });
  });

  describe("sorting", () => {
    it("should sort by name", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();

      cy.log("sorted by name by default");
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
      });

      cy.log("sorted by name ascending");
      H.DataStudio.Tasks.list().findByText("Name").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
      });

      cy.log("sorted by name descending");
      H.DataStudio.Tasks.list().findByText("Name").click();
      checkListSorting({
        visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_NAME].reverse(),
      });
    });

    it("should sort by location", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();

      cy.log("sorted by location ascending");
      H.DataStudio.Tasks.list().findByText("Location").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_LOCATION,
      });

      cy.log("sorted by location descending");
      H.DataStudio.Tasks.list().findByText("Location").click();
      checkListSorting({
        visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_LOCATION].reverse(),
      });
    });

    it("should sort by dependents errors", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();

      cy.log("sorted by dependents errors ascending");
      H.DataStudio.Tasks.list().findByText("Problems").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
      });

      cy.log("sorted by dependents errors descending");
      H.DataStudio.Tasks.list().findByText("Problems").click();
      checkListSorting({
        visibleEntities: [
          ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
        ].reverse(),
      });
    });

    it("should sort by dependents with errors", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();

      cy.log("sorted by dependents with errors ascending");
      H.DataStudio.Tasks.list().findByText("Broken dependents").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
      });

      cy.log("sorted by dependents with errors descending");
      H.DataStudio.Tasks.list().findByText("Broken dependents").click();
      checkListSorting({
        visibleEntities: [
          ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
        ].reverse(),
      });
    });
  });
});

function createContent({ withErrors = false }: { withErrors?: boolean } = {}) {
  createTableContent({ withErrors });
  createQuestionContent({ withErrors });
  createModelContent({ withErrors });
}

function createTableContent({
  withErrors = false,
}: { withErrors?: boolean } = {}) {
  if (!withErrors) {
    return;
  }

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_FIELD,
    query: {
      "source-table": PRODUCTS_ID,
      fields: [["field", ORDERS.TOTAL, null]],
    },
  });

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Expression: ["+", ["field", ORDERS.TOTAL, null], 0],
      },
    },
  });

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_FILTER,
    query: {
      "source-table": PRODUCTS_ID,
      filter: ["=", ["field", ORDERS.TOTAL, null], 0],
    },
  });

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
    query: {
      "source-table": PRODUCTS_ID,
      breakout: [["field", ORDERS.TOTAL, null]],
    },
  });

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
    },
  });

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_IMPLICIT_JOIN,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["min", ["field", REVIEWS.ID, { "source-field": ORDERS.PRODUCT_ID }]],
        [
          "avg",
          ["field", REVIEWS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      ],
    },
  });

  H.createQuestion({
    name: TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          "source-table": PRODUCTS_ID,
          alias: "Products",
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
        },
      ],
      aggregation: [
        ["max", ["field", REVIEWS.ID, { "join-alias": "Products" }]],
      ],
    },
  });
}

function createQuestionContent({
  withErrors = false,
}: { withErrors?: boolean } = {}) {
  H.createQuestion({
    name: TABLE_BASED_QUESTION,
    query: {
      "source-table": ORDERS_ID,
    },
    collection_id: ADMIN_PERSONAL_COLLECTION_ID,
  }).then(({ body: card }) => {
    if (!withErrors) {
      return;
    }

    H.createQuestion({
      name: QUESTION_BASED_QUESTION_BROKEN_FILTER,
      query: {
        "source-table": `card__${card.id}`,
        filter: [">", ["field", "PRICE", { "base-type": "type/Float" }], 10],
      },
    });
  });
}

function createModelContent({
  withErrors = false,
}: { withErrors?: boolean } = {}) {
  H.createQuestion({
    name: TABLE_BASED_MODEL,
    type: "model",
    query: {
      "source-table": ORDERS_ID,
    },
  }).then(({ body: card }) => {
    if (!withErrors) {
      return;
    }

    H.createQuestion({
      name: MODEL_BASED_MODEL_BROKEN_AGGREGATION,
      type: "model",
      query: {
        "source-table": `card__${card.id}`,
        aggregation: [
          ["distinct", ["field", "AMOUNT", { "base-type": "type/Integer" }]],
        ],
      },
    });
  });
}

function checkList({
  visibleEntities = [],
  hiddenEntities = [],
}: {
  visibleEntities?: string[];
  hiddenEntities?: string[];
}) {
  H.DataStudio.Tasks.list().within(() => {
    visibleEntities.forEach((name) => {
      cy.findByText(name).should("be.visible");
    });
    hiddenEntities.forEach((name) => {
      cy.findByText(name).should("not.exist");
    });
  });
}

function checkSidebar({
  entityName,
  missingColumns,
  brokenDependents,
}: {
  entityName: string;
  missingColumns?: string[];
  brokenDependents?: string[];
}) {
  H.DataStudio.Tasks.sidebar().within(() => {
    H.DataStudio.Tasks.Sidebar.header()
      .findByText(entityName)
      .should("be.visible");
    if (missingColumns) {
      H.DataStudio.Tasks.Sidebar.missingColumnsInfo().within(() => {
        missingColumns.forEach((column) => {
          cy.findByText(column).should("be.visible");
        });
      });
    }
    if (brokenDependents) {
      H.DataStudio.Tasks.Sidebar.brokenDependentsInfo().within(() => {
        brokenDependents.forEach((dependent) => {
          cy.findByText(dependent).should("be.visible");
        });
      });
    }
  });
}

function checkListSorting({ visibleEntities }: { visibleEntities: string[] }) {
  H.DataStudio.Tasks.list().within(() => {
    visibleEntities.forEach((name, index) => {
      cy.findByText(name)
        .parents("[data-index]")
        .should("have.attr", "data-index", index.toString());
    });
  });
}
