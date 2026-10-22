import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId } from "metabase-types/api";

const { H } = cy;

const SOURCE_TABLE = "mtt_source_table";
const OUTPUT_TABLE_SLUG = "mtt_output_table";
const OUTPUT_TABLE_LABEL = "Mtt Output Table";
const SOURCE_TABLE_LABEL = "Mtt Source Table";

const MIGRATE_MODELS_PATH = "/data-studio/transforms/tools/migrate-models";

const SOURCE_ROW_NAME = "Source Row Alpha";
const SOURCE_ROW_NAME_2 = "Source Row Beta";
// The transform output does not get this row, because it is inserted after the conversion.
const SOURCE_ROW_NAME_NEW = "Source Row Gamma";

const CATEGORY_FILTER_ID = "mtt-category-filter";

describe(
  "scenarios > data-studio > model to transform",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      dropAllTestTables();

      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      cy.intercept(
        "POST",
        "/api/ee/replacement/replace-model-with-transform",
      ).as("replaceModelWithTransform");
    });

    it("converts a model to a transform and rewires all its dependents", () => {
      createTestTables();
      H.createQuestion({
        name: "Sample DB model",
        database: SAMPLE_DB_ID,
        type: "model",
        query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
      });
      createSourceModel("Target model").then(({ body: model }) => {
        createQuestionOnModel("Direct dependent", model.id).as("direct");
        createQuestionOnModel("Nested dependent", model.id)
          .as("nested")
          .then(({ body: parent }) => {
            H.createQuestion({
              name: "Second level nested",
              database: WRITABLE_DB_ID,
              query: { "source-table": `card__${parent.id}` },
            }).as("secondLevel");
          });
        createFilteredDashboardOnModel(model.id).as("dashboardInfo");
        H.createQuestion({
          name: "Amount sum metric",
          database: WRITABLE_DB_ID,
          type: "metric",
          query: {
            "source-table": `card__${model.id}`,
            aggregation: [
              ["sum", ["field", "amount", { "base-type": "type/Decimal" }]],
            ],
          },
        }).as("metric");
        createQuestionJoiningModel("Joined question", model.id).as("joined");
      });

      cy.log(
        "trigger is disabled when the database doesn't support transforms",
      );
      openMigrateModelsPage();
      selectModelInTable("Sample DB model");
      cy.findByTestId("model-sidebar")
        .findByRole("button", { name: /Convert to a transform/ })
        .should("be.disabled");

      cy.log("convert the model");
      selectModelInTable("Target model");
      openReplaceWithTransformModal();
      submitReplaceWithTransformForm();
      waitForReplacementToComplete();
      insertNewSourceRow();

      cy.log("direct dependent now reads from the transform's output table");
      cy.get<Cypress.Response<{ id: CardId }>>("@direct").then(({ body }) => {
        H.visitQuestion(body.id);
        assertOutputRowsVisible();
        H.openNotebook();
        assertDataSourceIs(OUTPUT_TABLE_LABEL);
      });

      cy.log("nested dependent now reads from the transform's output table");
      cy.get<Cypress.Response<{ id: CardId }>>("@nested").then(({ body }) => {
        H.visitQuestion(body.id);
        assertOutputRowsVisible();
      });

      cy.log("two-level nested question reads the transform's output table");
      cy.get<Cypress.Response<{ id: CardId }>>("@secondLevel").then(
        ({ body }) => {
          H.visitQuestion(body.id);
          assertOutputRowsVisible();
        },
      );

      cy.get<{ dashboard_id: number; card_id: CardId }>("@dashboardInfo").then(
        ({ dashboard_id, card_id }) => {
          cy.log("dashboard still renders after conversion");
          H.visitDashboard(dashboard_id);
          H.main().findByText(SOURCE_ROW_NAME).should("be.visible");
          H.main().findByText(SOURCE_ROW_NAME_2).should("be.visible");
          H.main().findByText(SOURCE_ROW_NAME_NEW).should("not.exist");

          cy.log("filter widget still narrows the results");
          H.toggleFilterWidgetValues(["A"]);
          H.main().findByText(SOURCE_ROW_NAME).should("be.visible");
          H.main().findByText(SOURCE_ROW_NAME_2).should("not.exist");

          cy.log("the dashboard question now points to the transform output");
          H.visitQuestion(card_id);
          H.openNotebook();
          assertDataSourceIs(OUTPUT_TABLE_LABEL);
        },
      );

      cy.get<Cypress.Response<{ id: CardId }>>("@metric").then(({ body }) => {
        cy.log("the metric sum does not include the row added to the source");
        H.visitMetric(body.id);
        H.main().findByText("301.25").should("be.visible");
      });

      cy.get<Cypress.Response<{ id: CardId }>>("@joined").then(({ body }) => {
        cy.log("joined question still runs");
        H.visitQuestion(body.id);
        assertSourceRowsVisible();

        cy.log("the join now reads from the transform's output table");
        H.openNotebook();
        H.getNotebookStep("join")
          .findByLabelText("Right table")
          .findByText(OUTPUT_TABLE_LABEL)
          .should("be.visible");
      });

      cy.log("new transform appears on the transform list and opens cleanly");
      cy.visit("/data-studio/transforms");
      H.main().findByText("Target model").click();
      assertDataSourceIs(SOURCE_TABLE_LABEL);

      cy.log("non-admin users cannot access the migrate models page");
      cy.signInAsNormalUser();
      cy.visit(MIGRATE_MODELS_PATH);
      H.main()
        .findByText("Sorry, you don\u2019t have permission to see that.")
        .should("be.visible");
    });
  },
);

function dropAllTestTables() {
  H.queryWritableDB(
    `
    DROP TABLE IF EXISTS ${SOURCE_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${OUTPUT_TABLE_SLUG} CASCADE;
    `,
    "postgres",
  );
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
      (1, '${SOURCE_ROW_NAME}', 100.50, 'A'),
      (2, '${SOURCE_ROW_NAME_2}', 200.75, 'B');
    `,
    "postgres",
  );

  H.resyncDatabase({ dbId: WRITABLE_DB_ID });
}

function getTableId(tableName: string) {
  return H.getTableId({ databaseId: WRITABLE_DB_ID, name: tableName });
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

function createQuestionOnModel(name: string, modelId: CardId) {
  return H.createQuestion({
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${modelId}` },
  });
}

function createQuestionJoiningModel(name: string, modelId: CardId) {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "id" }).then((sourceIdField) =>
      H.createQuestion({
        name,
        database: WRITABLE_DB_ID,
        query: {
          "source-table": sourceTableId,
          joins: [
            {
              alias: "ModelJoin",
              "source-table": `card__${modelId}`,
              fields: "all",
              condition: [
                "=",
                ["field", sourceIdField, { "base-type": "type/Integer" }],
                [
                  "field",
                  "id",
                  {
                    "base-type": "type/Integer",
                    "join-alias": "ModelJoin",
                  },
                ],
              ],
            },
          ],
        },
      }),
    ),
  );
}

function createFilteredDashboardOnModel(modelId: CardId) {
  return getTableId(SOURCE_TABLE).then((sourceTableId) =>
    H.getFieldId({ tableId: sourceTableId, name: "category" }).then(
      (categoryFieldId) =>
        H.createQuestionAndDashboard({
          questionDetails: {
            name: "Dashboard-bound question",
            database: WRITABLE_DB_ID,
            query: { "source-table": `card__${modelId}` },
          },
          dashboardDetails: {
            name: "Dashboard on model",
            parameters: [
              {
                id: CATEGORY_FILTER_ID,
                type: "string/=",
                name: "Category",
                slug: "category",
              },
            ],
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

function openMigrateModelsPage() {
  cy.visit(MIGRATE_MODELS_PATH);
  H.main().findByText("Pick a model to convert").should("be.visible");
}

function selectModelInTable(modelName: string) {
  H.main()
    .findByRole("row", { name: new RegExp(modelName) })
    .click();
  cy.findByTestId("model-sidebar").should("be.visible");
  cy.findByTestId("model-sidebar-header")
    .findByText(modelName)
    .should("be.visible");
}

function openReplaceWithTransformModal() {
  cy.findByTestId("model-sidebar")
    .findByRole("button", { name: /Convert to a transform/ })
    .click();
  H.modal()
    .findByText("Convert this model to a transform?")
    .should("be.visible");

  H.modal()
    .findByLabelText("Table name")
    .should(($input) => {
      // Unjustified type cast. FIXME
      expect(($input.val() as string).length).to.be.greaterThan(0);
    });
}

function submitReplaceWithTransformForm(targetName = OUTPUT_TABLE_SLUG) {
  H.modal().findByLabelText("Table name").clear().type(targetName);
  getSubmitButton().click();
}

function getSubmitButton() {
  return H.modal().findByRole("button", {
    name: /Convert to a transform/,
  });
}

function waitForReplacementToComplete() {
  const POLL_INTERVAL_MS = 250;
  const POLL_TIMEOUT_MS = 60_000;
  const MAX_ATTEMPTS = POLL_TIMEOUT_MS / POLL_INTERVAL_MS;

  cy.wait("@replaceModelWithTransform").then((interception) => {
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

  H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: OUTPUT_TABLE_SLUG });
}

function assertSourceRowsVisible() {
  H.main().findAllByText(SOURCE_ROW_NAME).first().should("be.visible");
  H.main().findAllByText(SOURCE_ROW_NAME_2).first().should("be.visible");
}

function insertNewSourceRow() {
  H.queryWritableDB(
    `INSERT INTO ${SOURCE_TABLE} VALUES (3, '${SOURCE_ROW_NAME_NEW}', 999.00, 'C');`,
    "postgres",
  );
}

function assertOutputRowsVisible() {
  assertSourceRowsVisible();
  H.main().findByText(SOURCE_ROW_NAME_NEW).should("not.exist");
}

function assertDataSourceIs(tableLabel: string) {
  cy.findByTestId("data-step-cell").should("have.text", tableLabel);
}
