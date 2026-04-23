import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { ConcreteFieldReference } from "metabase-types/api";

const { H } = cy;
const { SourceReplacement } = H.DataModel;

const SOURCE_TABLE = "source_table";
const COMPATIBLE_TARGET = "compatible_target";
const TARGET_EXTRA_COLUMNS = "target_extra_columns";
const TARGET_TYPE_MISMATCH = "target_type_mismatch";
const TARGET_MISSING_COLUMN = "target_missing_column";
const CHILD_TABLE = "child_table";

const ALL_TABLES = [
  SOURCE_TABLE,
  COMPATIBLE_TARGET,
  TARGET_EXTRA_COLUMNS,
  TARGET_TYPE_MISMATCH,
  TARGET_MISSING_COLUMN,
  CHILD_TABLE,
];

const SOURCE_TABLE_LABEL = "Source Table";
const COMPATIBLE_TARGET_LABEL = "Compatible Target";
const TARGET_EXTRA_COLUMNS_LABEL = "Target Extra Columns";
const TARGET_TYPE_MISMATCH_LABEL = "Target Type Mismatch";
const TARGET_MISSING_COLUMN_LABEL = "Target Missing Column";

const SOURCE_ROW_VALUE = "Source Value 1";
const COMPATIBLE_TARGET_ROW_VALUE = "Compatible Target Value";
const ANOTHER_TARGET_ROW_VALUE = "Another Target Row";
const EXTRA_COLUMNS_TARGET_ROW_VALUE = "Extra Columns Target Value";

const CATEGORY_FILTER_ID = "category-filter";

type FieldRefScenario = {
  cardId: number;
  amountRef: ConcreteFieldReference;
  categoryRef: ConcreteFieldReference;
};

describe(
  "scenarios > data-studio > source replacement",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      dropAllTestTables();

      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.intercept("POST", "/api/ee/replacement/replace-source").as(
        "replaceSource",
      );
      cy.intercept("GET", "/api/ee/dependencies/graph/dependents*").as(
        "dependents",
      );
    });

    describe("Successful replacements", () => {
      it("updates all dependent questions on the source table", () => {
        createTestTables();
        createSourceQuestion("Q1 plain").as("q1");
        createSourceQuestion("Q2 filtered", {
          filter: [
            ">",
            ["field", "amount", { "base-type": "type/Decimal" }],
            50,
          ],
        });
        createSourceQuestion("Q3 count", { aggregation: [["count"]] });

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(COMPATIBLE_TARGET_LABEL);

        cy.log("all dependents are listed in the modal");
        SourceReplacement.getDependentsTab(3).click();
        SourceReplacement.getModal().within(() => {
          cy.findByText("Q1 plain").should("be.visible");
          cy.findByText("Q2 filtered").should("be.visible");
          cy.findByText("Q3 count").should("be.visible");
        });

        confirmReplacement();
        waitForReplacementToComplete();

        cy.log("first question now queries the new table");
        cy.get<Cypress.Response<{ id: number }>>("@q1").then(({ body }) => {
          H.visitQuestion(body.id);
          assertTargetRowVisible();
          H.main().findByText(SOURCE_ROW_VALUE).should("not.exist");
          H.openNotebook();
          assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
        });
      });

      it("allows replacement when target has extra columns", () => {
        createTestTables();
        createSourceQuestion("Question on source").as("question");

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(TARGET_EXTRA_COLUMNS_LABEL);

        cy.log("column comparison is shown and replace is enabled");
        SourceReplacement.getModal()
          .findByText("Column comparison")
          .should("be.visible");

        confirmReplacement();
        waitForReplacementToComplete();

        cy.get<Cypress.Response<{ id: number }>>("@question").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            H.main()
              .findByText(EXTRA_COLUMNS_TARGET_ROW_VALUE)
              .should("be.visible");

            H.openNotebook();
            assertDataSourceIs(TARGET_EXTRA_COLUMNS_LABEL);
          },
        );
      });

      it("replaces a joined table without breaking the question", () => {
        createTestTables();
        createQuestionJoiningSourceIntoExtraColumns("Joined question").as(
          "question",
        );

        replaceSourceWithTarget(SOURCE_TABLE_LABEL, COMPATIBLE_TARGET_LABEL);

        cy.log(
          "the only extra_columns row (D) now joins the D row from compatible_target",
        );
        cy.get<Cypress.Response<{ id: number }>>("@question").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            H.main()
              .findByText(EXTRA_COLUMNS_TARGET_ROW_VALUE)
              .should("be.visible");
            H.main().findByText(ANOTHER_TARGET_ROW_VALUE).should("be.visible");
          },
        );
      });

      it("updates a model and questions built on it", () => {
        createTestTables();
        createSourceModel("Source model").then(({ body: model }) => {
          cy.wrap(model.id).as("modelId");
          createQuestionOnModel("Question on model", model.id).as(
            "nestedQuestion",
          );
        });

        replaceSourceWithTarget(SOURCE_TABLE_LABEL, COMPATIBLE_TARGET_LABEL);

        cy.log("nested question shows data from the new table");
        cy.get<Cypress.Response<{ id: number }>>("@nestedQuestion").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            assertTargetRowVisible();
            H.main().findByText(SOURCE_ROW_VALUE).should("not.exist");
          },
        );

        cy.log("the model's own data source was updated");
        cy.get<number>("@modelId").then((modelId) => {
          cy.visit(`/model/${modelId}/query`);
          assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
        });
      });

      it("updates a metric defined on the source table", () => {
        createTestTables();
        getTableId(SOURCE_TABLE).then((sourceTableId) => {
          H.getFieldId({ tableId: sourceTableId, name: "amount" }).then(
            (amountId) => {
              H.createQuestion({
                name: "Amount sum metric",
                database: WRITABLE_DB_ID,
                type: "metric",
                query: {
                  "source-table": sourceTableId,
                  aggregation: [["sum", ["field", amountId, null]]],
                },
              }).as("metric");
            },
          );
        });

        replaceSourceWithTarget(SOURCE_TABLE_LABEL, COMPATIBLE_TARGET_LABEL);

        cy.log("metric now aggregates data from the new table");
        cy.get<Cypress.Response<{ id: number }>>("@metric").then(({ body }) => {
          H.visitMetric(body.id);
          H.main().findByText("800").should("be.visible");
        });
      });

      it("updates a dashboard with parameter filters", () => {
        createTestTables();
        createFilteredDashboardOnSource().as("dashboardInfo");

        replaceSourceWithTarget(SOURCE_TABLE_LABEL, COMPATIBLE_TARGET_LABEL);

        cy.get<{ dashboard_id: number; card_id: number }>(
          "@dashboardInfo",
        ).then(({ dashboard_id, card_id }) => {
          cy.log("dashboard renders with new data");
          H.visitDashboard(dashboard_id);
          H.main().findByText(COMPATIBLE_TARGET_ROW_VALUE).should("be.visible");

          cy.log("filter widget still works after replacement");
          H.toggleFilterWidgetValues(["C"]);
          H.main().findByText(COMPATIBLE_TARGET_ROW_VALUE).should("be.visible");

          cy.log("the underlying question's data source was updated");
          H.visitQuestion(card_id);
          H.openNotebook();
          assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
        });
      });

      it("reassigns segments and measures to the target table", () => {
        createTestTables();

        getTableId(SOURCE_TABLE).as("sourceTableId");
        getTableId(COMPATIBLE_TARGET).as("targetTableId");

        createHighAmountSegment().then((segmentId) => {
          createSourceQuestion("Question using segment", {
            filter: ["segment", segmentId],
          }).as("segmentQuestion");
        });
        createSourceTotalAmountMeasure().as("measure");

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(COMPATIBLE_TARGET_LABEL);

        cy.log("dependents tab lists the question, segment, and measure");
        SourceReplacement.getDependentsTab(3).click();
        SourceReplacement.getModal().within(() => {
          cy.findByText("Question using segment").should("be.visible");
          cy.findByText("High amount").should("be.visible");
          cy.findByText("Total amount").should("be.visible");
        });

        confirmReplacement();
        waitForReplacementToComplete();

        cy.log("the dependent question still runs against the target");
        cy.get<Cypress.Response<{ id: number }>>("@segmentQuestion").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            assertTargetRowVisible();
          },
        );

        cy.log("segment now shows on the target table in the data model UI");
        visitWritableTableSegments("@targetTableId");
        H.DataModel.SegmentList.getSegment("High amount").should("be.visible");

        cy.log(
          "segment no longer shows on the source table in the data model UI",
        );
        visitWritableTableSegments("@sourceTableId");
        H.DataModel.SegmentList.get().should("not.contain", "High amount");

        cy.log("measure now shows on the target table in the data model UI");
        visitWritableTableMeasures("@targetTableId");
        H.DataModel.MeasureList.getMeasure("Total amount").should("be.visible");

        cy.log(
          "measure no longer shows on the source table in the data model UI",
        );
        visitWritableTableMeasures("@sourceTableId");
        H.DataModel.MeasureList.get().should("not.contain", "Total amount");

        cy.log("measure still aggregates correctly against the target table");
        cy.get<Cypress.Response<{ id: number }>>("@measure").then(
          ({ body: measure }) => {
            cy.get<number>("@targetTableId").then((targetTableId) => {
              H.visitQuestionAdhoc({
                dataset_query: {
                  type: "query",
                  database: WRITABLE_DB_ID,
                  query: {
                    "source-table": targetTableId,
                    aggregation: [["measure", measure.id]],
                  },
                },
              });
            });
            H.main().findByText("800").should("be.visible");
          },
        );
      });

      it("updates a transform that sources the replaced table", () => {
        createTestTables();
        createSourceTransform("Source transform").then(
          ({ body: transform }) => {
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            cy.log("transform now references the new source table");
            H.visitTransform(transform.id);
            assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
          },
        );
      });
    });

    describe("Blocked replacements", () => {
      it("blocks replacement when target has a column type mismatch", () => {
        createTestTables();
        createSourceQuestion("Question on source");

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(TARGET_TYPE_MISMATCH_LABEL);

        SourceReplacement.getModal().within(() => {
          cy.findByText("Column comparison").should("be.visible");
          cy.findByText(
            "This column has a different data type than the original column.",
          ).should("be.visible");
        });
        SourceReplacement.getReplaceButton().should("be.disabled");
      });

      it("blocks replacement when target is missing a required column", () => {
        createTestTables();
        createSourceQuestion("Question on source");

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(TARGET_MISSING_COLUMN_LABEL);

        SourceReplacement.getModal().within(() => {
          cy.findByText("Column comparison").should("be.visible");
          cy.findByText("This data source isn't compatible.").should(
            "be.visible",
          );
        });
        SourceReplacement.getReplaceButton().should("be.disabled");
      });

      it("blocks replacement when source table has foreign keys", () => {
        createTestTablesWithForeignKey();
        createSourceQuestion("Question on source");

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(COMPATIBLE_TARGET_LABEL);

        SourceReplacement.getModal()
          .findByText(
            "The original table can't be referenced by a foreign key by another table.",
          )
          .should("be.visible");
        SourceReplacement.getReplaceButton().should("be.disabled");
      });

      it("blocks replacement when target would create a cycle", () => {
        createTestTables();
        createSourceQuestion("Question on source");

        openReplacementModal(SOURCE_TABLE_LABEL);

        cy.log("pick a question that depends on source_table as the target");
        SourceReplacement.getTargetPickerButton().click();
        H.entityPickerModal().within(() => {
          cy.findByText("Our analytics").click();
          cy.findByText("Question on source").click();
        });

        SourceReplacement.getModal()
          .findByText(
            "The replacement data source can't be based on the original data source.",
          )
          .should("be.visible");
        SourceReplacement.getReplaceButton().should("be.disabled");
      });

      it("blocks replacement when source table has no dependents", () => {
        createTestTables();

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(COMPATIBLE_TARGET_LABEL);

        SourceReplacement.getModal()
          .findByText(
            "Nothing uses this data source, so there's nothing to replace.",
          )
          .should("be.visible");
        SourceReplacement.getReplaceButton().should("be.disabled");
      });
    });

    describe("Entry points", () => {
      it("opens replacement from the dependency graph and replaces successfully", () => {
        createTestTables();
        createSourceQuestion("Graph question").as("question");

        getTableId(SOURCE_TABLE).then((sourceTableId) => {
          cy.visit(`/data-studio/dependencies?id=${sourceTableId}&type=table`);
        });

        cy.log("open replacement modal from the graph info panel");
        H.DependencyGraph.graph().findByLabelText(SOURCE_TABLE_LABEL).click();
        cy.findByTestId("graph-info-panel")
          .findByLabelText("Replace data source")
          .first()
          .click();

        SourceReplacement.getModal()
          .findByText("Find and replace a data source")
          .should("be.visible");

        pickTarget(COMPATIBLE_TARGET_LABEL);
        confirmReplacement();
        waitForReplacementToComplete();

        cy.get<Cypress.Response<{ id: number }>>("@question").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            assertTargetRowVisible();
            H.main().findByText(SOURCE_ROW_VALUE).should("not.exist");
            H.openNotebook();
            assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
          },
        );
      });
    });

    describe("Native queries", () => {
      it("replaces a table referenced in a native SQL question", () => {
        createTestTables();
        createSourceQuestion("MBQL dependent");

        H.createNativeQuestion({
          name: "Native SQL question",
          database: WRITABLE_DB_ID,
          native: { query: `SELECT id, name, amount FROM ${SOURCE_TABLE}` },
        }).as("nativeQuestion");

        cy.get<Cypress.Response<{ id: number }>>("@nativeQuestion").then(
          ({ body }) => {
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            H.visitQuestion(body.id);
            assertTargetRowVisible();
            H.main().findByText(SOURCE_ROW_VALUE).should("not.exist");
          },
        );
      });

      it.skip("replaces a table referenced via a native query snippet", () => {
        createTestTables();
        createSourceQuestion("MBQL dependent");

        H.createSnippet({
          name: "source query",
          content: `SELECT id, name, amount FROM ${SOURCE_TABLE}`,
        }).then(({ body: snippet }) => {
          H.createNativeQuestion({
            name: "Snippet question",
            database: WRITABLE_DB_ID,
            native: {
              query: "SELECT * FROM ({{snippet: source query}}) AS source_data",
              "template-tags": {
                "snippet: source query": {
                  id: "snippet-tag-id",
                  name: "snippet: source query",
                  "display-name": "Source Query",
                  type: "snippet",
                  "snippet-name": "source query",
                  "snippet-id": snippet.id,
                },
              },
            },
          }).as("snippetQuestion");
        });

        cy.get<Cypress.Response<{ id: number }>>("@snippetQuestion").then(
          ({ body }) => {
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            H.visitQuestion(body.id);
            assertTargetRowVisible();
            H.main().findByText(SOURCE_ROW_VALUE).should("not.exist");
          },
        );
      });
    });

    describe("Access control", () => {
      it("non-admin users cannot access source replacement", () => {
        createTestTables();
        createSourceQuestion("Question on source");

        cy.signInAsNormalUser();
        cy.visit("/data-studio/data");
        H.main()
          .findByText("Sorry, you don\u2019t have permission to see that.")
          .should("be.visible");
      });
    });

    describe("Sandboxing", () => {
      it("blocks replacement when the source table has a sandbox policy", () => {
        createTestTables();
        createSourceQuestion("Question on source");

        getTableId(SOURCE_TABLE).then((sourceTableId) => {
          H.getFieldId({ tableId: sourceTableId, name: "category" }).then(
            (categoryFieldId) => {
              H.createQuestion({
                name: "Sandbox filter question",
                database: WRITABLE_DB_ID,
                query: {
                  "source-table": sourceTableId,
                  filter: ["=", ["field", categoryFieldId, null], "A"],
                },
              }).then(({ body: sandboxQuestion }) => {
                cy.sandboxTable({
                  table_id: sourceTableId,
                  card_id: sandboxQuestion.id,
                  group_id: USER_GROUPS.COLLECTION_GROUP,
                });
              });
            },
          );
        });

        openReplacementModal(SOURCE_TABLE_LABEL);
        pickTarget(COMPATIBLE_TARGET_LABEL);

        SourceReplacement.getModal()
          .findByText(
            "This table has row or column security policies that block this replacement.",
          )
          .should("be.visible");
        SourceReplacement.getReplaceButton().should("be.disabled");
      });
    });

    describe("Field ref upgrades", () => {
      describe("numeric field id on a question directly on the source table", () => {
        it("rewrites the card's own filter ref after swap", () => {
          createTestTables();
          createQuestionUsingFieldIdRef().then(({ cardId }) => {
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            H.visitQuestion(cardId);
            assertTargetRowVisible();
          });
        });

        it("rewrites viz settings column_settings ref keys", () => {
          createTestTables();
          createQuestionUsingFieldIdRef().then(({ cardId, amountRef }) => {
            setNestedCardColumnTitle({
              nestedCardId: cardId,
              columnRef: amountRef,
            });
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            H.visitQuestion(cardId);
            assertTargetRowVisible();
            H.main().findByText("Renamed Column").should("be.visible");
          });
        });

        it("rewrites a dashboard parameter target", () => {
          createTestTables();
          createQuestionUsingFieldIdRef().then((scenario) => {
            buildParameterTargetDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertParameterTargetStillWorks();
          });
        });

        it("rewrites dashcard click_behavior parameterMapping", () => {
          createTestTables();
          createQuestionUsingFieldIdRef().then((scenario) => {
            buildClickBehaviorDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertClickBehaviorStillWorks();
          });
        });

        it("rewrites a parameter values_source_config card value_field ref", () => {
          createTestTables();
          createQuestionUsingFieldIdRef().then((scenario) => {
            buildCardSourcedValuesDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertCardSourcedValuesStillWork();
          });
        });
      });

      describe("numeric field id in a nested card on a parent question", () => {
        it("rewrites the nested card's filter ref after swap", () => {
          createTestTables();
          createNestedQuestionUsingFieldIdRef().then(({ cardId }) => {
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            H.visitQuestion(cardId);
            assertTargetRowVisible();
          });
        });

        it("rewrites a dashboard parameter target", () => {
          createTestTables();
          createNestedQuestionUsingFieldIdRef().then((scenario) => {
            buildParameterTargetDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertParameterTargetStillWorks();
          });
        });

        it("rewrites dashcard click_behavior parameterMapping", () => {
          createTestTables();
          createNestedQuestionUsingFieldIdRef().then((scenario) => {
            buildClickBehaviorDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertClickBehaviorStillWorks();
          });
        });

        it("rewrites a parameter values_source_config card value_field ref", () => {
          createTestTables();
          createNestedQuestionUsingFieldIdRef().then((scenario) => {
            buildCardSourcedValuesDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertCardSourcedValuesStillWork();
          });
        });
      });

      describe("`_2` suffix ref in a nested card whose parent has a same-name join", () => {
        it("rewrites the nested card's `_2` filter ref after swap", () => {
          createTestTables();
          createNestedQuestionUsingJoinSuffixRef().then(({ cardId }) => {
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );

            H.visitQuestion(cardId);
            assertTargetRowVisible();
          });
        });

        it("rewrites a dashboard parameter target", () => {
          createTestTables();
          createNestedQuestionUsingJoinSuffixRef().then((scenario) => {
            buildParameterTargetDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertParameterTargetStillWorks();
          });
        });

        it("rewrites dashcard click_behavior parameterMapping", () => {
          createTestTables();
          createNestedQuestionUsingJoinSuffixRef().then((scenario) => {
            buildClickBehaviorDashboard(scenario);
            replaceSourceWithTarget(
              SOURCE_TABLE_LABEL,
              COMPATIBLE_TARGET_LABEL,
            );
            assertClickBehaviorStillWorks();
          });
        });
      });
    });
  },
);

function dropAllTestTables() {
  const drops = ALL_TABLES.map(
    (table) => `DROP TABLE IF EXISTS ${table} CASCADE`,
  ).join("; ");
  H.queryWritableDB(drops, "postgres");
}

function createTestTables() {
  dropAllTestTables();

  H.queryWritableDB(
    `
    CREATE TABLE ${SOURCE_TABLE} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${SOURCE_TABLE} VALUES
      (1, 'Source Value 1', 100.50, 'A'),
      (2, 'Source Value 2', 200.75, 'B');

    CREATE TABLE ${COMPATIBLE_TARGET} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${COMPATIBLE_TARGET} VALUES
      (10, 'Compatible Target Value', 300.00, 'C'),
      (11, 'Another Target Row', 500.00, 'D');

    CREATE TABLE ${TARGET_EXTRA_COLUMNS} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100),
      extra_field VARCHAR(50)
    );
    INSERT INTO ${TARGET_EXTRA_COLUMNS} VALUES
      (20, 'Extra Columns Target Value', 400.00, 'D', 'extra');

    CREATE TABLE ${TARGET_TYPE_MISMATCH} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount TEXT,
      category VARCHAR(100)
    );
    INSERT INTO ${TARGET_TYPE_MISMATCH} VALUES
      (30, 'Type Mismatch Value', 'not-a-number', 'E');

    CREATE TABLE ${TARGET_MISSING_COLUMN} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      category VARCHAR(100)
    );
    INSERT INTO ${TARGET_MISSING_COLUMN} VALUES
      (40, 'Missing Column Value', 'F');
    `,
    "postgres",
  );

  H.resyncDatabase({ dbId: WRITABLE_DB_ID });
}

function createTestTablesWithForeignKey() {
  dropAllTestTables();

  H.queryWritableDB(
    `
    CREATE TABLE ${SOURCE_TABLE} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${SOURCE_TABLE} VALUES
      (1, 'Source Value 1', 100.50, 'A');

    CREATE TABLE ${COMPATIBLE_TARGET} (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255),
      amount NUMERIC(10,2),
      category VARCHAR(100)
    );
    INSERT INTO ${COMPATIBLE_TARGET} VALUES
      (10, 'Compatible Target Value', 300.00, 'C');

    CREATE TABLE ${CHILD_TABLE} (
      id INTEGER PRIMARY KEY,
      source_id INTEGER REFERENCES ${SOURCE_TABLE}(id),
      label VARCHAR(100)
    );
    INSERT INTO ${CHILD_TABLE} VALUES
      (1, 1, 'child record');
    `,
    "postgres",
  );

  H.resyncDatabase({ dbId: WRITABLE_DB_ID });
}

function getTableId(tableName: string) {
  return H.getTableId({ databaseId: WRITABLE_DB_ID, name: tableName });
}

function openReplacementModal(sourceTableLabel: string) {
  H.DataModel.visitDataStudio();

  H.DataModel.TablePicker.getDatabase("Writable Postgres12").click();
  H.DataModel.TablePicker.getTable(sourceTableLabel).click();
  H.DataModel.TableSection.get().should("be.visible");

  SourceReplacement.getFindAndReplaceButton().click();
  SourceReplacement.getModal()
    .findByText("Find and replace a data source")
    .should("be.visible");

  cy.wait("@dependents");
}

function pickTarget(targetTableLabel: string) {
  SourceReplacement.getTargetPickerButton().click();
  H.entityPickerModal()
    .findByRole("searchbox")
    .should("be.visible")
    .type(targetTableLabel);
  cy.findByTestId("result-item")
    .contains(targetTableLabel)
    .closest("a")
    .click();
}

function confirmReplacement() {
  SourceReplacement.getModal()
    .findByRole("tab", {
      name: /\d+ items? will be changed/,
    })
    .should("be.visible");

  SourceReplacement.getModal()
    .findByRole("button", {
      name: /Replace data source in \d+ item/,
    })
    .click();

  SourceReplacement.getConfirmationModal()
    .findByRole("button", { name: /Replace data source/ })
    .click();
}

function waitForReplacementToComplete() {
  const POLL_INTERVAL_MS = 250;
  const POLL_TIMEOUT_MS = 30_000;
  const MAX_ATTEMPTS = POLL_TIMEOUT_MS / POLL_INTERVAL_MS;

  cy.wait("@replaceSource").then((interception) => {
    const runId = interception.response?.body.run_id;

    const pollStatus = (attempt = 0): void => {
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `Replacement polling timed out after ${POLL_TIMEOUT_MS}ms`,
        );
      }

      cy.request("GET", `/api/ee/replacement/runs/${runId}`).then(
        ({ body }) => {
          if (body.status === "succeeded") {
            return;
          }
          if (body.status === "failed") {
            throw new Error("Replacement failed: " + body.message);
          }
          return cy.wait(POLL_INTERVAL_MS).then(() => pollStatus(attempt + 1));
        },
      );
    };
    return pollStatus();
  });
}

function replaceSourceWithTarget(
  sourceTableLabel: string,
  targetTableLabel: string,
) {
  openReplacementModal(sourceTableLabel);
  pickTarget(targetTableLabel);
  confirmReplacement();
  waitForReplacementToComplete();
}

function createSourceQuestion(
  name: string,
  queryOverrides: Record<string, unknown> = {},
) {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.createQuestion({
      name,
      database: WRITABLE_DB_ID,
      query: { "source-table": sourceTableId, ...queryOverrides },
    }),
  );
}

function createSourceModel(name: string) {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.createQuestion({
      name,
      database: WRITABLE_DB_ID,
      type: "model",
      query: { "source-table": sourceTableId },
    }),
  );
}

function createQuestionOnModel(name: string, modelId: number) {
  return H.createQuestion({
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${modelId}` },
  });
}

type JoinedQuestionAliases = {
  sourceTableId: number;
  extraColumnsTableId: number;
  sourceCategoryFieldId: number;
  extraColumnsCategoryFieldId: number;
};

function createQuestionJoiningSourceIntoExtraColumns(name: string) {
  getTableId(SOURCE_TABLE).as("sourceTableId");
  getTableId(TARGET_EXTRA_COLUMNS).as("extraColumnsTableId");

  cy.get<number>("@sourceTableId").then((sourceTableId) => {
    H.getFieldId({ tableId: sourceTableId, name: "category" }).as(
      "sourceCategoryFieldId",
    );
  });
  cy.get<number>("@extraColumnsTableId").then((extraColumnsTableId) => {
    H.getFieldId({ tableId: extraColumnsTableId, name: "category" }).as(
      "extraColumnsCategoryFieldId",
    );
  });

  return cy.then(function (this: JoinedQuestionAliases) {
    const {
      sourceTableId,
      extraColumnsTableId,
      sourceCategoryFieldId,
      extraColumnsCategoryFieldId,
    } = this;

    return H.createQuestion({
      name,
      database: WRITABLE_DB_ID,
      query: {
        "source-table": extraColumnsTableId,
        joins: [
          {
            alias: SOURCE_TABLE_LABEL,
            "source-table": sourceTableId,
            fields: "all",
            condition: [
              "=",
              [
                "field",
                extraColumnsCategoryFieldId,
                { "base-type": "type/Text" },
              ],
              [
                "field",
                sourceCategoryFieldId,
                {
                  "base-type": "type/Text",
                  "join-alias": SOURCE_TABLE_LABEL,
                },
              ],
            ],
          },
        ],
      },
    });
  });
}

function createFilteredDashboardOnSource() {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "category" }).then(
      (categoryFieldId) =>
        H.createQuestionAndDashboard({
          questionDetails: {
            name: "Filtered question",
            database: WRITABLE_DB_ID,
            query: { "source-table": sourceTableId },
          },
          dashboardDetails: {
            name: "Dashboard with filter",
            parameters: [categoryStringParameter(CATEGORY_FILTER_ID)],
          },
        }).then(({ body: { dashboard_id, card_id } }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              parameter_mappings: [
                {
                  parameter_id: CATEGORY_FILTER_ID,
                  card_id,
                  target: ["dimension", ["field", categoryFieldId, null]],
                },
              ],
            },
          });
          return cy.wrap({ dashboard_id, card_id });
        }),
    ),
  );
}

function createHighAmountSegment() {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "amount" }).then(
      (amountFieldId) =>
        H.createSegment({
          name: "High amount",
          table_id: sourceTableId,
          definition: {
            type: "query",
            database: WRITABLE_DB_ID,
            query: {
              "source-table": sourceTableId,
              filter: [">", ["field", amountFieldId, null], 50],
            },
          },
        }).then(({ body: segment }) => segment.id),
    ),
  );
}

function createSourceTotalAmountMeasure() {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "amount" }).then(
      (amountFieldId) =>
        H.createMeasure({
          name: "Total amount",
          table_id: sourceTableId,
          definition: {
            "source-table": sourceTableId,
            aggregation: [["sum", ["field", amountFieldId, null]]],
          },
        }),
    ),
  );
}

function createSourceTransform(name: string) {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "amount" }).then((amountId) =>
      H.createTransform({
        name,
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": sourceTableId,
              filter: [">", ["field", amountId, null], 0],
            },
          },
        },
        target: {
          type: "table",
          database: WRITABLE_DB_ID,
          name: "transform_output",
          schema: "public",
        },
      }),
    ),
  );
}

function createQuestionUsingFieldIdRef(): Cypress.Chainable<FieldRefScenario> {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "amount" }).then((amountId) =>
      H.getFieldId({ tableId: sourceTableId, name: "category" }).then(
        (categoryId) => {
          const amountRef: ConcreteFieldReference = [
            "field",
            amountId,
            { "base-type": "type/Decimal" },
          ];
          const categoryRef: ConcreteFieldReference = [
            "field",
            categoryId,
            { "base-type": "type/Text" },
          ];
          return H.createQuestion({
            name: "Question filtered by numeric field id",
            database: WRITABLE_DB_ID,
            query: {
              "source-table": sourceTableId,
              filter: [">", amountRef, 0],
            },
          }).then(({ body: card }) => ({
            cardId: card.id,
            amountRef,
            categoryRef,
          }));
        },
      ),
    ),
  );
}

function createNestedQuestionUsingFieldIdRef(): Cypress.Chainable<FieldRefScenario> {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "amount" }).then((amountId) =>
      H.getFieldId({ tableId: sourceTableId, name: "category" }).then(
        (categoryId) => {
          const amountRef: ConcreteFieldReference = [
            "field",
            amountId,
            { "base-type": "type/Decimal" },
          ];
          const categoryRef: ConcreteFieldReference = [
            "field",
            categoryId,
            { "base-type": "type/Text" },
          ];
          return H.createQuestion({
            name: "Parent question on source table",
            database: WRITABLE_DB_ID,
            query: { "source-table": sourceTableId },
          }).then(({ body: parent }) =>
            H.createQuestion({
              name: "Nested question filtered by numeric field id",
              database: WRITABLE_DB_ID,
              query: {
                "source-table": `card__${parent.id}`,
                filter: [">", amountRef, 0],
              },
            }).then(({ body: nested }) => ({
              cardId: nested.id,
              amountRef,
              categoryRef,
            })),
          );
        },
      ),
    ),
  );
}

function createNestedQuestionUsingJoinSuffixRef(): Cypress.Chainable<FieldRefScenario> {
  const amountRef: ConcreteFieldReference = [
    "field",
    "amount_2",
    { "base-type": "type/Decimal" },
  ];
  const categoryRef: ConcreteFieldReference = [
    "field",
    "category_2",
    { "base-type": "type/Text" },
  ];

  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "category" }).then(
      (sourceCategoryId) =>
        getTableId(COMPATIBLE_TARGET).then((joinTableId) =>
          H.getFieldId({ tableId: joinTableId, name: "category" }).then(
            (joinCategoryId) =>
              H.createQuestion({
                name: "Parent question with same-name join",
                database: WRITABLE_DB_ID,
                query: {
                  "source-table": sourceTableId,
                  joins: [
                    {
                      alias: COMPATIBLE_TARGET_LABEL,
                      "source-table": joinTableId,
                      fields: "all",
                      condition: [
                        "=",
                        [
                          "field",
                          sourceCategoryId,
                          { "base-type": "type/Text" },
                        ],
                        [
                          "field",
                          joinCategoryId,
                          {
                            "base-type": "type/Text",
                            "join-alias": COMPATIBLE_TARGET_LABEL,
                          },
                        ],
                      ],
                    },
                  ],
                },
              }).then(({ body: parent }) =>
                H.createQuestion({
                  name: "Nested question filtered by legacy join suffix ref",
                  database: WRITABLE_DB_ID,
                  query: {
                    "source-table": `card__${parent.id}`,
                    filter: [">", amountRef, 0],
                  },
                }).then(({ body: nested }) => ({
                  cardId: nested.id,
                  amountRef,
                  categoryRef,
                })),
              ),
          ),
        ),
    ),
  );
}

function visitWritableTableSegments(tableIdAlias: string) {
  cy.get<number>(tableIdAlias).then((tableId) => {
    H.DataModel.visitDataStudioSegments({
      databaseId: WRITABLE_DB_ID,
      schemaId: `${WRITABLE_DB_ID}:public`,
      tableId,
    });
  });
}

function visitWritableTableMeasures(tableIdAlias: string) {
  cy.get<number>(tableIdAlias).then((tableId) => {
    H.DataModel.visitDataStudioMeasures({
      databaseId: WRITABLE_DB_ID,
      schemaId: `${WRITABLE_DB_ID}:public`,
      tableId,
    });
  });
}

function buildParameterTargetDashboard({
  cardId,
  categoryRef,
}: FieldRefScenario) {
  H.createDashboard({
    name: "Parameter target dashboard",
    parameters: [categoryStringParameter(CATEGORY_FILTER_ID)],
  }).then(({ body: dashboard }) => {
    H.addOrUpdateDashboardCard({
      dashboard_id: dashboard.id,
      card_id: cardId,
      card: {
        parameter_mappings: [
          {
            parameter_id: CATEGORY_FILTER_ID,
            card_id: cardId,
            target: ["dimension", categoryRef],
          },
        ],
      },
    });
    cy.wrap(dashboard.id).as("dashboardId");
  });
}

function buildClickBehaviorDashboard({
  cardId,
  categoryRef,
}: FieldRefScenario) {
  H.createDashboard({
    name: "Click behavior dashboard",
    parameters: [categoryStringParameter(CATEGORY_FILTER_ID)],
  }).then(({ body: dashboard }) => {
    H.addOrUpdateDashboardCard({
      dashboard_id: dashboard.id,
      card_id: cardId,
      card: {
        parameter_mappings: [
          {
            parameter_id: CATEGORY_FILTER_ID,
            card_id: cardId,
            target: ["dimension", categoryRef],
          },
        ],
        visualization_settings: {
          click_behavior: crossfilterClickBehavior(CATEGORY_FILTER_ID),
        },
      },
    });
    cy.wrap(dashboard.id).as("dashboardId");
  });
}

function buildCardSourcedValuesDashboard({
  cardId,
  categoryRef,
}: FieldRefScenario) {
  H.createDashboard({
    name: "Card-sourced values dashboard",
    parameters: [
      {
        ...categoryStringParameter(CATEGORY_FILTER_ID),
        values_source_type: "card",
        values_source_config: {
          card_id: cardId,
          value_field: categoryRef,
        },
      },
    ],
  }).then(({ body: dashboard }) => {
    H.addOrUpdateDashboardCard({
      dashboard_id: dashboard.id,
      card_id: cardId,
      card: {
        parameter_mappings: [
          {
            parameter_id: CATEGORY_FILTER_ID,
            card_id: cardId,
            target: ["dimension", categoryRef],
          },
        ],
      },
    });
    cy.wrap(dashboard.id).as("dashboardId");
  });
}

function assertParameterTargetStillWorks() {
  cy.get<number>("@dashboardId").then((dashboardId) => {
    H.visitDashboard(dashboardId);
    assertDashcardHasRows({
      visible: [COMPATIBLE_TARGET_ROW_VALUE, ANOTHER_TARGET_ROW_VALUE],
      hidden: [],
    });
    H.toggleFilterWidgetValues(["D"]);
    assertDashcardHasRows({
      visible: [ANOTHER_TARGET_ROW_VALUE],
      hidden: [COMPATIBLE_TARGET_ROW_VALUE],
    });
  });
}

function assertClickBehaviorStillWorks() {
  cy.get<number>("@dashboardId").then((dashboardId) => {
    H.visitDashboard(dashboardId);
    assertDashcardHasRows({
      visible: [COMPATIBLE_TARGET_ROW_VALUE, ANOTHER_TARGET_ROW_VALUE],
      hidden: [],
    });
    cy.findByTestId("dashcard").findAllByText("D").first().click();
    H.filterWidget().should("contain.text", "D");
    assertDashcardHasRows({
      visible: [ANOTHER_TARGET_ROW_VALUE],
      hidden: [COMPATIBLE_TARGET_ROW_VALUE],
    });
  });
}

function assertCardSourcedValuesStillWork() {
  cy.get<number>("@dashboardId").then((dashboardId) => {
    H.visitDashboard(dashboardId);
    assertDashcardHasRows({
      visible: [COMPATIBLE_TARGET_ROW_VALUE, ANOTHER_TARGET_ROW_VALUE],
      hidden: [],
    });
    H.filterWidget().click();
    H.popover().findByText("C").should("be.visible");
    H.popover().findByText("D").should("be.visible");
    H.popover().within(() => {
      cy.findByText("D").click();
      cy.button("Add filter").click();
    });
    assertDashcardHasRows({
      visible: [ANOTHER_TARGET_ROW_VALUE],
      hidden: [COMPATIBLE_TARGET_ROW_VALUE],
    });
  });
}

function categoryStringParameter(id: string) {
  return {
    id,
    type: "string/=",
    name: "Category",
    slug: "category",
  };
}

function crossfilterClickBehavior(parameterId: string) {
  return {
    type: "crossfilter",
    parameterMapping: {
      [parameterId]: {
        id: parameterId,
        source: { id: "category", name: "category", type: "column" },
        target: { id: parameterId, type: "parameter" },
      },
    },
  };
}

function setNestedCardColumnTitle({
  nestedCardId,
  columnRef,
}: {
  nestedCardId: number;
  columnRef: ConcreteFieldReference;
}) {
  // Legacy column_settings keys store refs with null options. See
  // getLegacyColumnKey in frontend/src/metabase-lib/v1/queries/utils/column-key.ts.
  const legacyRef: ConcreteFieldReference = [
    columnRef[0],
    columnRef[1],
    null,
  ] as ConcreteFieldReference;
  const columnKey = JSON.stringify(["ref", legacyRef]);
  return cy.request("PUT", `/api/card/${nestedCardId}`, {
    visualization_settings: {
      column_settings: {
        [columnKey]: { column_title: "Renamed Column" },
      },
    },
  });
}

function assertTargetRowVisible() {
  H.main()
    .findAllByText(COMPATIBLE_TARGET_ROW_VALUE)
    .first()
    .should("be.visible");
}

function assertDataSourceIs(tableLabel: string) {
  cy.findByTestId("data-step-cell").should("have.text", tableLabel);
}

function assertDashcardHasRows({
  visible,
  hidden,
}: {
  visible: string[];
  hidden: string[];
}) {
  cy.findByTestId("dashcard").within(() => {
    visible.forEach((text) =>
      cy.findAllByText(text).first().should("be.visible"),
    );
    hidden.forEach((text) => cy.findAllByText(text).should("have.length", 0));
  });
}
