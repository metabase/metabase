import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  ConcreteFieldReference,
  Dataset,
  MetricDatasetRequest,
} from "metabase-types/api";

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

const COLUMN_TYPE_MISMATCH_MESSAGE =
  "This column has a different data type than the original column.";

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
      it("replaces the source from the dependency graph in questions, segments, and measures", () => {
        createTestTables();

        getTableId(SOURCE_TABLE).as("sourceTableId");
        getTableId(COMPATIBLE_TARGET).as("targetTableId");

        createSourceQuestion("Q1 plain").as("q1");
        createSourceQuestion("Q2 filtered", {
          filter: [
            ">",
            ["field", "amount", { "base-type": "type/Decimal" }],
            50,
          ],
        });
        createSourceQuestion("Q3 count", { aggregation: [["count"]] });
        createHighAmountSegment().then((segmentId) => {
          createSourceQuestion("Question using segment", {
            filter: ["segment", segmentId],
          }).as("segmentQuestion");
        });
        createSourceTotalAmountMeasure().as("measure");

        // The replacement modal fetches the dependents of the source table
        // exactly once when it opens; wait for the async dependency backfill
        // so the dependency rows exist by then.
        H.waitForBackfillComplete();

        cy.get<number>("@sourceTableId").then((sourceTableId) => {
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

        cy.log("all direct dependents are listed in the modal");
        SourceReplacement.getModal()
          .findByRole("tab", { name: "6 items will be changed", timeout: 15000 })
          .click();
        SourceReplacement.getModal()
          .should("contain", "Q1 plain")
          .and("contain", "Q2 filtered")
          .and("contain", "Q3 count")
          .and("contain", "Question using segment")
          .and("contain", "High amount")
          .and("contain", "Total amount");

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

        cy.log("the question using the segment still runs against the target");
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
        H.DataModel.SegmentList.get()
          .should("be.visible")
          .and("not.contain", "High amount");

        cy.log("measure now shows on the target table in the data model UI");
        visitWritableTableMeasures("@targetTableId");
        H.DataModel.MeasureList.getMeasure("Total amount").should("be.visible");

        cy.log(
          "measure no longer shows on the source table in the data model UI",
        );
        visitWritableTableMeasures("@sourceTableId");
        H.DataModel.MeasureList.get()
          .should("be.visible")
          .and("not.contain", "Total amount");

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

      it("updates models, metrics, dashboards, transforms, joins, and native SQL on the source table", () => {
        createTestTables();
        createSourceModel("Source model").then(({ body: model }) => {
          cy.wrap(model.id).as("modelId");
          createQuestionOnModel("Question on model", model.id).as(
            "nestedQuestion",
          );
        });
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
        createFilteredDashboardOnSource().as("dashboardInfo");
        createSourceTransform("Source transform").as("transform");
        H.createNativeQuestion({
          name: "Native SQL question",
          database: WRITABLE_DB_ID,
          native: { query: `SELECT id, name, amount FROM ${SOURCE_TABLE}` },
        }).as("nativeQuestion");
        createQuestionJoiningSourceIntoExtraColumns("Joined question").as(
          "joinedQuestion",
        );

        replaceSourceWithTarget(SOURCE_TABLE_LABEL, COMPATIBLE_TARGET_LABEL);

        cy.log("nested question on the model shows data from the new table");
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

        cy.log("metric now aggregates data from the new table");
        cy.get<Cypress.Response<{ id: number }>>("@metric").then(({ body }) => {
          cy.intercept("POST", "/api/metric/dataset").as("metricDataset");
          H.visitMetric(body.id);
          cy.wait<MetricDatasetRequest, Dataset>("@metricDataset").then(
            ({ response }) => {
              expect(response?.statusCode).to.equal(202);
              const total = response?.body.data.rows.reduce((sum, row) => {
                return sum + Number(row[row.length - 1]);
              }, 0);
              expect(total).to.equal(800);
            },
          );
          cy.findByTestId("visualization-root")
            .should("be.visible")
            .and("have.attr", "data-viz-ui-name", "Number");
          cy.findByTestId("scalar-value").should("have.text", "800");
        });

        cy.get<{ dashboard_id: number; card_id: number }>(
          "@dashboardInfo",
        ).then(({ dashboard_id, card_id }) => {
          cy.log("dashboard renders with new data");
          H.visitDashboard(dashboard_id);
          H.main().findByText(COMPATIBLE_TARGET_ROW_VALUE).should("be.visible");

          cy.log("filter widget still works after replacement");
          H.toggleFilterWidgetValues(["C"]);
          H.main().findByText(COMPATIBLE_TARGET_ROW_VALUE).should("be.visible");

          cy.log(
            "the dashboard's underlying question's data source was updated",
          );
          H.visitQuestion(card_id);
          H.openNotebook();
          assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
        });

        cy.log("transform now references the new source table");
        cy.get<Cypress.Response<{ id: number }>>("@transform").then(
          ({ body }) => {
            H.visitTransform(body.id);
            assertDataSourceIs(COMPATIBLE_TARGET_LABEL);
          },
        );

        cy.log("native SQL question now queries the new table");
        cy.get<Cypress.Response<{ id: number }>>("@nativeQuestion").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            assertTargetRowVisible();
            H.main().findByText(SOURCE_ROW_VALUE).should("not.exist");
          },
        );

        cy.log(
          "the only extra_columns row (D) now joins the D row from compatible_target",
        );
        cy.get<Cypress.Response<{ id: number }>>("@joinedQuestion").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            H.main()
              .findByText(EXTRA_COLUMNS_TARGET_ROW_VALUE)
              .should("be.visible");
            H.main().findByText(ANOTHER_TARGET_ROW_VALUE).should("be.visible");
          },
        );
      });

      it("blocks incompatible targets, replaces with a target that has extra columns, and denies non-admins", () => {
        createTestTables();
        createSourceQuestion("Question on source").as("question");

        openReplacementModal(SOURCE_TABLE_LABEL);

        cy.log("a question that depends on source_table would create a cycle");
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

        cy.log("a target with a column type mismatch is blocked");
        pickTarget(TARGET_TYPE_MISMATCH_LABEL, {
          currentTargetLabel: "Question on source",
        });
        SourceReplacement.getModal().within(() => {
          cy.contains("button", TARGET_TYPE_MISMATCH_LABEL).should(
            "be.visible",
          );
          cy.findByText("Column comparison").should("be.visible");
          cy.findByText(COLUMN_TYPE_MISMATCH_MESSAGE).should("be.visible");
        });
        SourceReplacement.getReplaceButton().should("be.disabled");

        cy.log("a target missing a required column is blocked");
        pickTarget(TARGET_MISSING_COLUMN_LABEL, {
          currentTargetLabel: TARGET_TYPE_MISMATCH_LABEL,
        });
        SourceReplacement.getModal().within(() => {
          cy.contains("button", TARGET_MISSING_COLUMN_LABEL).should(
            "be.visible",
          );
          cy.findByText("Column comparison").should("be.visible");
          cy.findByText("This data source isn't compatible.").should(
            "be.visible",
          );
          cy.findByText(COLUMN_TYPE_MISMATCH_MESSAGE).should("not.exist");
        });
        SourceReplacement.getReplaceButton().should("be.disabled");

        cy.log("a target with extra columns is allowed");
        pickTarget(TARGET_EXTRA_COLUMNS_LABEL, {
          currentTargetLabel: TARGET_MISSING_COLUMN_LABEL,
        });
        SourceReplacement.getModal().within(() => {
          cy.contains("button", TARGET_EXTRA_COLUMNS_LABEL).should(
            "be.visible",
          );
          cy.findByText("Column comparison").should("be.visible");
        });

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

        cy.log("non-admin users cannot access the data studio data model");
        cy.signInAsNormalUser();
        cy.visit("/data-studio/data");
        H.main()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");
      });
    });

    describe("Native queries", () => {
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

    describe("Field ref upgrades", () => {
      it("rewrites numeric field id and `_2` suffix refs in cards, viz settings, and dashboards", () => {
        createTestTables();

        cy.log("numeric field id on a question directly on the source table");
        createQuestionUsingFieldIdRef().then((scenario) => {
          cy.wrap(scenario.cardId).as("directCardId");
          setNestedCardColumnTitle({
            nestedCardId: scenario.cardId,
            columnRef: scenario.amountRef,
          });
          buildClickBehaviorDashboard(scenario).as("directClickDashboardId");
          buildCardSourcedValuesDashboard(scenario).as(
            "directValuesDashboardId",
          );
        });

        cy.log("numeric field id in a nested card on a parent question");
        createNestedQuestionUsingFieldIdRef().then((scenario) => {
          buildClickBehaviorDashboard(scenario).as("nestedClickDashboardId");
          buildCardSourcedValuesDashboard(scenario).as(
            "nestedValuesDashboardId",
          );
        });

        cy.log(
          "`_2` suffix ref in a nested card whose parent has a same-name join",
        );
        createNestedQuestionUsingJoinSuffixRef().then((scenario) => {
          buildClickBehaviorDashboard(scenario).as(
            "joinSuffixClickDashboardId",
          );
        });

        replaceSourceWithTarget(SOURCE_TABLE_LABEL, COMPATIBLE_TARGET_LABEL);

        cy.log(
          "direct card: filter ref and column_settings key were rewritten",
        );
        cy.get<number>("@directCardId").then((cardId) => {
          H.visitQuestion(cardId);
          assertTargetRowVisible();
          H.main().findByText("Renamed Column").should("be.visible");
        });
        cy.get<number>("@directClickDashboardId").then(
          assertClickBehaviorStillWorks,
        );
        cy.get<number>("@directValuesDashboardId").then(
          assertCardSourcedValuesStillWork,
        );

        cy.log("nested card: filter ref and dashboard refs were rewritten");
        cy.get<number>("@nestedClickDashboardId").then(
          assertClickBehaviorStillWorks,
        );
        cy.get<number>("@nestedValuesDashboardId").then(
          assertCardSourcedValuesStillWork,
        );

        cy.log(
          "`_2` suffix card: filter ref and dashboard refs were rewritten",
        );
        cy.get<number>("@joinSuffixClickDashboardId").then(
          assertClickBehaviorStillWorks,
        );
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

function getTableId(tableName: string) {
  return H.getTableId({ databaseId: WRITABLE_DB_ID, name: tableName });
}

function openReplacementModal(sourceTableLabel: string) {
  // The modal fetches the dependents of the source table exactly once when it
  // opens, and the card -> table dependency rows are written by an async
  // backfill job. Wait for the backfill so the modal doesn't race it and show
  // "Nothing uses this data source" for a table that does have dependents.
  H.waitForBackfillComplete();

  H.DataModel.visitDataStudio();

  H.DataModel.TablePicker.getDatabase("Writable Postgres12").click();
  H.DataModel.TablePicker.getTable(sourceTableLabel).click();
  H.DataModel.TableSection.get().should("be.visible");

  H.DataModel.TableSection.getActionsMenuButton().click();
  SourceReplacement.getFindAndReplaceButton().click();
  SourceReplacement.getModal()
    .findByText("Find and replace a data source")
    .should("be.visible");

  cy.wait("@dependents");
}

function pickTarget(
  targetTableLabel: string,
  { currentTargetLabel }: { currentTargetLabel?: string } = {},
) {
  if (currentTargetLabel) {
    SourceReplacement.getModal().contains("button", currentTargetLabel).click();
  } else {
    SourceReplacement.getTargetPickerButton().click();
  }
  H.entityPickerModal().findByRole("searchbox").type(targetTableLabel);
  cy.findByTestId("result-item")
    .contains(targetTableLabel)
    .closest("a")
    .click();
}

function confirmReplacement() {
  SourceReplacement.getModal()
    .findByRole("tab", {
      // The affected-items count comes from an async dependents computation
      // that can exceed the default 4s timeout, so wait longer for the tab.
      name: /\d+ items? will be changed/,
      timeout: 15000,
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
          definition: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": sourceTableId,
              aggregation: [["sum", ["field", amountFieldId, null]]],
            },
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

function buildClickBehaviorDashboard({
  cardId,
  categoryRef,
}: FieldRefScenario): Cypress.Chainable<number> {
  return H.createDashboard({
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
    return cy.wrap(dashboard.id);
  });
}

function buildCardSourcedValuesDashboard({
  cardId,
  categoryRef,
}: FieldRefScenario): Cypress.Chainable<number> {
  return H.createDashboard({
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
    return cy.wrap(dashboard.id);
  });
}

function assertClickBehaviorStillWorks(dashboardId: number) {
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
}

function assertCardSourcedValuesStillWork(dashboardId: number) {
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
    // Visiting the question re-runs its query against the writable DB; allow
    // more than the default 4s for the result rows to render.
    .findAllByText(COMPATIBLE_TARGET_ROW_VALUE, { timeout: 15000 })
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
