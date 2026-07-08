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

    describe("Successful conversions", () => {
      it("updates direct and nested questions built on the converted model", () => {
        createTestTables();
        createSourceModel("Target model").then(({ body: model }) => {
          createQuestionOnModel("Direct dependent", model.id).as("direct");
          createQuestionOnCard("Nested dependent", model.id).then(
            ({ body: parent }) => {
              H.createQuestion({
                name: "Second level nested",
                database: WRITABLE_DB_ID,
                query: { "source-table": `card__${parent.id}` },
              }).as("secondLevel");
            },
          );
        });

        convertModelToTransform("Target model");

        cy.log("direct dependent now reads from the transform's output table");
        cy.get<Cypress.Response<{ id: CardId }>>("@direct").then(({ body }) => {
          H.visitQuestion(body.id);
          assertSourceRowsVisible();
          H.openNotebook();
          assertDataSourceIs(OUTPUT_TABLE_LABEL);
        });

        cy.log("two-level nested question still runs after the swap");
        cy.get<Cypress.Response<{ id: CardId }>>("@secondLevel").then(
          ({ body }) => {
            H.visitQuestion(body.id);
            assertSourceRowsVisible();
          },
        );
      });

      it("creates a transform that can be opened and queries the original source table", () => {
        createTestTables();
        createSourceModel("Transform source model");

        convertModelToTransform("Transform source model");

        cy.log("new transform appears on the transform list and opens cleanly");
        cy.visit("/data-studio/transforms");
        H.main().findByText("Transform source model").click();
        assertDataSourceIs(SOURCE_TABLE_LABEL);
      });

      it("keeps a dashboard with a parameter filter working after conversion", () => {
        createTestTables();
        createSourceModel("Dashboard model").then(({ body: model }) => {
          createFilteredDashboardOnModel(model.id).as("dashboardInfo");
        });

        convertModelToTransform("Dashboard model");

        cy.get<{ dashboard_id: number; card_id: CardId }>(
          "@dashboardInfo",
        ).then(({ dashboard_id, card_id }) => {
          cy.log("dashboard still renders after conversion");
          H.visitDashboard(dashboard_id);
          H.main().findByText(SOURCE_ROW_NAME).should("be.visible");
          H.main().findByText(SOURCE_ROW_NAME_2).should("be.visible");

          cy.log("filter widget still narrows the results");
          H.toggleFilterWidgetValues(["A"]);
          H.main().findByText(SOURCE_ROW_NAME).should("be.visible");
          H.main().findByText(SOURCE_ROW_NAME_2).should("not.exist");

          cy.log("the underlying question now points to the transform output");
          H.visitQuestion(card_id);
          H.openNotebook();
          assertDataSourceIs(OUTPUT_TABLE_LABEL);
        });
      });

      it("keeps a metric built on the model producing the same result", () => {
        createTestTables();
        createSourceModel("Metric base model").then(({ body: model }) => {
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
        });

        convertModelToTransform("Metric base model");

        cy.get<Cypress.Response<{ id: CardId }>>("@metric").then(({ body }) => {
          H.visitMetric(body.id);
          H.main().findByText("301.25").should("be.visible");
        });
      });

      it("keeps a joined question working after converting its joined model", () => {
        createTestTables();
        createSourceModel("Joined model").then(({ body: model }) => {
          createQuestionJoiningModel("Joined question", model.id).as("joined");
        });

        convertModelToTransform("Joined model");

        cy.get<Cypress.Response<{ id: CardId }>>("@joined").then(({ body }) => {
          H.visitQuestion(body.id);
          assertSourceRowsVisible();
        });
      });
    });

    it("disables the trigger when the model's database doesn't support transforms", () => {
      H.createQuestion({
        name: "Sample DB model",
        database: SAMPLE_DB_ID,
        type: "model",
        query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
      });

      openMigrateModelsPage();
      selectModelInTable("Sample DB model");

      cy.findByTestId("model-sidebar")
        .findByRole("button", { name: /Convert to a transform/ })
        .should("be.disabled");
    });

    it("non-admin users cannot access the migrate models page", () => {
      createTestTables();
      createSourceModel("Access test model");

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

function createQuestionOnCard(name: string, parentCardId: CardId) {
  return H.createQuestion({
    name,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${parentCardId}` },
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
  const POLL_TIMEOUT_MS = 30_000;
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

  H.resyncDatabase({ dbId: WRITABLE_DB_ID });
}

function convertModelToTransform(modelName: string) {
  openMigrateModelsPage();
  selectModelInTable(modelName);
  openReplaceWithTransformModal();
  submitReplaceWithTransformForm();
  waitForReplacementToComplete();
}

function assertSourceRowsVisible() {
  H.main().findAllByText(SOURCE_ROW_NAME).first().should("be.visible");
  H.main().findAllByText(SOURCE_ROW_NAME_2).first().should("be.visible");
}

function assertDataSourceIs(tableLabel: string) {
  cy.findByTestId("data-step-cell").should("have.text", tableLabel);
}
