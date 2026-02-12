import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { TransformId } from "metabase-types/api";

const { H } = cy;

const TABLE_NAME = "test_transform_table";
const TABLE_DISPLAY_NAME = "Test Transform Table";
const TABLE_TRANSFORM = "Test Transform";
const TABLE_BASED_QUESTION_BROKEN_FIELD =
  "Test Table-based question with broken field";
const TABLE_BASED_QUESTION_BROKEN_EXPRESSION =
  "Test Table-based question with broken expression";
const TABLE_BASED_QUESTION_BROKEN_FILTER =
  "Test Table-based question with broken filter";
const TABLE_BASED_QUESTION_BROKEN_BREAKOUT =
  "Test Table-based question with broken breakout";
const TABLE_BASED_QUESTION_BROKEN_AGGREGATION =
  "Test Table-based question with broken aggregation";
const TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN =
  "Test Table-based question with broken explicit join";
const TABLE_BASED_QUESTION = "Test Table-based question";
const QUESTION_BASED_QUESTION_BROKEN_FILTER =
  "Test Question-based question with broken filter";
const TABLE_BASED_MODEL = "Test Table-based model";
const MODEL_BASED_MODEL_BROKEN_AGGREGATION =
  "Test Model-based model with broken aggregation";

const BROKEN_TABLE_DEPENDENCIES = [TABLE_DISPLAY_NAME];
const BROKEN_TABLE_DEPENDENTS = [
  TABLE_BASED_QUESTION_BROKEN_FIELD,
  TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
  TABLE_BASED_QUESTION_BROKEN_FILTER,
  TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
  TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
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
  TABLE_BASED_MODEL,
  TABLE_BASED_QUESTION,
  TABLE_DISPLAY_NAME,
];

const BROKEN_DEPENDENCIES_SORTED_BY_LOCATION = [
  TABLE_BASED_QUESTION, // Bobby Tables's personal collection
  TABLE_BASED_MODEL, // Our analytics
  TABLE_DISPLAY_NAME, // Writable Postgres
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS = [
  TABLE_BASED_QUESTION, // 1 error: PRICE
  TABLE_BASED_MODEL, // 1 error: AMOUNT
  TABLE_DISPLAY_NAME, // 2 errors: SCORE, STATUS
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS = [
  TABLE_BASED_QUESTION, // 1 question
  TABLE_BASED_MODEL, // 1 model
  TABLE_DISPLAY_NAME, // 6 questions
];

const BROKEN_DEPENDENTS = [
  ...BROKEN_TABLE_DEPENDENTS,
  ...BROKEN_QUESTION_DEPENDENTS,
  ...BROKEN_MODEL_DEPENDENTS,
];

describe("scenarios > dependencies > broken list", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    createContent();
  });

  afterEach(() => {
    dropTransformTable();
  });

  describe("analysis", () => {
    it("should show broken dependencies", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();
      checkList({
        visibleEntities: BROKEN_DEPENDENCIES,
        hiddenEntities: BROKEN_DEPENDENTS,
      });
    });
  });

  describe("selecting entities", () => {
    it("should show sidebar for broken dependents and trigger snowplow event", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();

      cy.log("table dependents");
      H.DependencyDiagnostics.list().findByText(TABLE_DISPLAY_NAME).click();
      checkSidebar({
        title: TABLE_DISPLAY_NAME,
        transform: TABLE_TRANSFORM,
        missingColumns: ["score", "status"],
        brokenDependents: BROKEN_TABLE_DEPENDENTS,
      });
      H.expectUnstructuredSnowplowEvent({
        event: "dependency_diagnostics_entity_selected",
        triggered_from: "broken",
      });

      cy.log("question dependents");
      H.DependencyDiagnostics.list().findByText(TABLE_BASED_QUESTION).click();
      checkSidebar({
        title: TABLE_BASED_QUESTION,
        missingColumns: ["PRICE"],
        brokenDependents: BROKEN_QUESTION_DEPENDENTS,
      });

      cy.log("model dependents");
      H.DependencyDiagnostics.list().findByText(TABLE_BASED_MODEL).click();
      checkSidebar({
        title: TABLE_BASED_MODEL,
        missingColumns: ["AMOUNT"],
        brokenDependents: BROKEN_MODEL_DEPENDENTS,
      });
    });
  });

  describe("search", () => {
    it("should search for entities", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.searchInput().type(TABLE_DISPLAY_NAME);
      checkList({
        visibleEntities: [TABLE_DISPLAY_NAME],
        hiddenEntities: [TABLE_BASED_QUESTION, TABLE_BASED_MODEL],
      });
    });
  });

  describe("filtering", () => {
    it("should filter entities by type", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.filterButton().click();
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
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.filterButton().click();
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
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.searchInput().type("test");

      cy.log("sorted by name by default");
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
      });

      cy.log("sorted by name ascending");
      H.DependencyDiagnostics.list().findByText("Dependency").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
      });

      cy.log("sorted by name descending");
      H.DependencyDiagnostics.list().findByText("Dependency").click();
      checkListSorting({
        visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_NAME].reverse(),
      });
    });

    it("should sort by location", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.searchInput().type("test");

      cy.log("sorted by location ascending");
      H.DependencyDiagnostics.list().findByText("Location").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_LOCATION,
      });

      cy.log("sorted by location descending");
      H.DependencyDiagnostics.list().findByText("Location").click();
      checkListSorting({
        visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_LOCATION].reverse(),
      });
    });

    it("should sort by dependents errors", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.searchInput().type("test");

      cy.log("sorted by dependents errors ascending");
      H.DependencyDiagnostics.list().findByText("Problems").click();
      checkListSorting({
        visibleEntities: [
          ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
        ].reverse(),
      });

      cy.log("sorted by dependents errors descending");
      H.DependencyDiagnostics.list().findByText("Problems").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
      });
    });

    it("should sort by dependents with errors", () => {
      H.DependencyDiagnostics.visitBrokenDependencies();
      H.DependencyDiagnostics.searchInput().type("test");

      cy.log("sorted by dependents with errors ascending");
      H.DependencyDiagnostics.list().findByText("Broken dependents").click();
      checkListSorting({
        visibleEntities: [
          ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
        ].reverse(),
      });

      cy.log("sorted by dependents with errors descending");
      H.DependencyDiagnostics.list().findByText("Broken dependents").click();
      checkListSorting({
        visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
      });
    });
  });
});

function createContent() {
  createTransform();
  createTableContent();
  createQuestionContent();
  createModelContent();
  breakTransform();
  waitForBreakingDependencies();
}

function dropTransformTable() {
  cy.get<TransformId>("@transformId").then((transformId) => {
    cy.request("DELETE", `/api/transform/${transformId}/table`);
  });
}

function createTransform() {
  H.createTransform(
    {
      name: TABLE_TRANSFORM,
      source: {
        type: "query",
        query: {
          type: "native",
          database: WRITABLE_DB_ID,
          native: {
            query: "SELECT 1 as score, 'active' as status",
          },
        },
      },
      target: {
        type: "table",
        database: WRITABLE_DB_ID,
        schema: "public",
        name: TABLE_NAME,
      },
    },
    { wrapId: true },
  );
  cy.get<TransformId>("@transformId").then((transformId) => {
    H.runTransform(transformId);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE_NAME });
    H.waitForTransformRuns(
      (runs) =>
        runs.length === 1 && runs.every((run) => run.status === "succeeded"),
    );
  });
}

function breakTransform() {
  cy.get<TransformId>("@transformId").then((transformId) => {
    cy.request("PUT", `/api/transform/${transformId}`, {
      source: {
        type: "query",
        query: {
          type: "native",
          database: WRITABLE_DB_ID,
          native: {
            query: "SELECT 1 as score_new, 'active' as status_new",
          },
        },
      },
    });
    H.runTransform(transformId);
    H.waitForTransformRuns(
      (runs) =>
        runs.length === 2 && runs.every((run) => run.status === "succeeded"),
    );
  });
}

function createTableContent() {
  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    cy.wrap(tableId).as("tableId");

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

function createQuestionContent() {
  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    H.createQuestion({
      name: TABLE_BASED_QUESTION,
      database: WRITABLE_DB_ID,
      query: {
        "source-table": tableId,
      },
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    }).then(({ body: card }) => {
      cy.wrap(card.id).as("questionId");
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

function createModelContent() {
  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    H.createQuestion({
      name: TABLE_BASED_MODEL,
      type: "model",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": tableId,
      },
    }).then(({ body: card }) => {
      cy.wrap(card.id).as("modelId");
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

function waitForBreakingDependencies() {
  H.waitForBreakingDependencies(
    (nodes) => nodes.length >= BROKEN_DEPENDENCIES.length,
  );
}

function checkList({
  visibleEntities = [],
  hiddenEntities = [],
}: {
  visibleEntities?: string[];
  hiddenEntities?: string[];
}) {
  H.DependencyDiagnostics.list().within(() => {
    visibleEntities.forEach((name) => {
      cy.findByText(name).should("exist");
    });
    hiddenEntities.forEach((name) => {
      cy.findByText(name).should("not.exist");
    });
  });
}

function checkSidebar({
  title,
  transform,
  missingColumns,
  brokenDependents,
}: {
  title: string;
  transform?: string;
  missingColumns?: string[];
  brokenDependents?: string[];
}) {
  H.DependencyDiagnostics.sidebar().within(() => {
    H.DependencyDiagnostics.Sidebar.header()
      .findByText(title)
      .should("be.visible");
    if (transform) {
      H.DependencyDiagnostics.Sidebar.infoSection()
        .findByText(transform)
        .should("exist");
    }
    if (missingColumns) {
      H.DependencyDiagnostics.Sidebar.missingColumnsSection().within(() => {
        missingColumns.forEach((column) => {
          cy.findByText(column).should("exist");
        });
      });
    }
    if (brokenDependents) {
      H.DependencyDiagnostics.Sidebar.brokenDependentsSection().within(() => {
        brokenDependents.forEach((dependent) => {
          cy.findByText(dependent).should("exist");
        });
      });
    }
  });
}

function checkListSorting({ visibleEntities }: { visibleEntities: string[] }) {
  H.DependencyDiagnostics.list().within(() => {
    visibleEntities.forEach((name, index) => {
      cy.findByText(name)
        .parents("[data-index]")
        .should("have.attr", "data-index", index.toString());
    });
  });
}
