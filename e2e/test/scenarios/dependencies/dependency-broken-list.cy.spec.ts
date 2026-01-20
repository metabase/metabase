import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const TABLE_NAME = "scoreboard_actions";
const TABLE_DISPLAY_NAME = "Scoreboard Actions";
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
  TABLE_DISPLAY_NAME,
  TABLE_BASED_MODEL,
  TABLE_BASED_QUESTION,
];

const BROKEN_DEPENDENCIES_SORTED_BY_LOCATION = [
  TABLE_BASED_MODEL, // Bobby Tables's personal collection
  TABLE_BASED_QUESTION, // Our analytics
  TABLE_DISPLAY_NAME, // Sample database
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS = [
  TABLE_DISPLAY_NAME, // 3 errors: TOTAL, ID, RATING
  TABLE_BASED_QUESTION, // 1 error: PRICE
  TABLE_BASED_MODEL, // 1 error: AMOUNT
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS = [
  TABLE_DISPLAY_NAME, // 7 questions
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
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TABLE_NAME });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE_NAME });
  });

  describe("analysis", () => {
    it("should show broken dependencies", () => {
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

  describe("search", () => {
    it("should search for entities", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.searchInput().type("Products");
      checkList({
        visibleEntities: ["Products"],
        hiddenEntities: [TABLE_BASED_QUESTION, TABLE_BASED_MODEL],
      });
    });
  });

  describe("filtering", () => {
    it("should filter entities by type", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.filterButton().click();
      H.popover().within(() => {
        cy.findByText("Table").click();
        cy.findByText("Question").click();
        cy.findByText("Model").click();
      });

      cy.log("only tables");
      H.popover().findByText("Table").click();
      checkList({
        visibleEntities: BROKEN_TABLE_DEPENDENCIES,
        hiddenEntities: [
          ...BROKEN_QUESTION_DEPENDENCIES,
          ...BROKEN_MODEL_DEPENDENCIES,
        ],
      });

      cy.log("only questions");
      H.popover().within(() => {
        cy.findByText("Table").click();
        cy.findByText("Question").click();
      });
      checkList({
        visibleEntities: BROKEN_QUESTION_DEPENDENCIES,
        hiddenEntities: [
          ...BROKEN_TABLE_DEPENDENCIES,
          ...BROKEN_MODEL_DEPENDENCIES,
        ],
      });

      cy.log("only models");
      H.popover().within(() => {
        cy.findByText("Question").click();
        cy.findByText("Model").click();
      });
      checkList({
        visibleEntities: BROKEN_MODEL_DEPENDENCIES,
        hiddenEntities: [
          ...BROKEN_TABLE_DEPENDENCIES,
          ...BROKEN_QUESTION_DEPENDENCIES,
        ],
      });
    });

    it("should filter entities by location", () => {
      createContent({ withErrors: true });
      H.DataStudio.Tasks.visitBrokenEntities();
      H.DataStudio.Tasks.filterButton().click();
      H.popover().within(() => {
        cy.findByText("Include items in personal collections").click();
      });
      checkList({
        visibleEntities: [
          ...BROKEN_TABLE_DEPENDENCIES,
          ...BROKEN_MODEL_DEPENDENCIES,
        ],
        hiddenEntities: BROKEN_QUESTION_DEPENDENCIES,
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

  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    H.getFieldId({ tableId, name: "score" }).then((scoreFieldId) => {
      H.getFieldId({ tableId, name: "status" }).then((statusFieldId) => {
        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_FIELD,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            fields: [["field", statusFieldId, null]],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            expressions: {
              Expression: ["+", ["field", scoreFieldId, null], 0],
            },
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_FILTER,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            filter: ["=", ["field", scoreFieldId, null], 0],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            breakout: [["field", scoreFieldId, null]],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            aggregation: [["avg", ["field", scoreFieldId, null]]],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            joins: [
              {
                "source-table": tableId,
                alias: TABLE_DISPLAY_NAME,
                condition: [
                  "=",
                  ["field", statusFieldId, null],
                  [
                    "field",
                    statusFieldId,
                    { "join-alias": TABLE_DISPLAY_NAME },
                  ],
                ],
              },
            ],
            aggregation: [
              [
                "max",
                ["field", scoreFieldId, { "join-alias": TABLE_DISPLAY_NAME }],
              ],
            ],
          },
        });
      });
    });
  });
}

function createQuestionContent({
  withErrors = false,
}: { withErrors?: boolean } = {}) {
  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    H.createQuestion({
      name: TABLE_BASED_QUESTION,
      database: WRITABLE_DB_ID,
      query: {
        "source-table": tableId,
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
  });
}

function createModelContent({
  withErrors = false,
}: { withErrors?: boolean } = {}) {
  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    H.createQuestion({
      name: TABLE_BASED_MODEL,
      type: "model",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": tableId,
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
