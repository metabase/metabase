import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { PortableTable } from "e2e/support/helpers";
import type { Card } from "metabase-types/api";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";

const APP_SLUG = "synced-actions-app";
const APP_DISPLAY_NAME = "Synced Actions App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedActionsAppColl1";

const SCOREBOARD_TABLE: PortableTable = [
  "Writable Postgres12",
  "public",
  TEST_TABLE,
];

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

/**
 * The action half of the production path. Outside the dev preview
 * `toExecutableActionId` runs `copiedActionEntityId`, the copy on the app's copy
 * of the model, because that is the only action an app's viewers may execute.
 * The copies reach Metabase through `resources/` and a repository pull.
 */
describe(
  "scenarios > data apps > resources in production (actions)",
  { tags: ["@external", "@actions"] },
  () => {
    const removeTestFiles = () =>
      cy.task("removeDataAppPaths", {
        paths: [`${APP_ROOT()}/actions`, `${APP_ROOT()}/resources`],
      });

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);
      H.createModelFromTableName({
        tableName: TEST_TABLE,
        modelName: MODEL_NAME,
      });

      removeTestFiles();
    });

    after(() => {
      removeTestFiles();
    });

    /**
     * Declares the source model's create action, writes the copies an author
     * copies from the repository, publishes the app, and yields it with the
     * copy's entity ID.
     */
    const publishApp = () =>
      cy.get<number>("@modelId").then((modelId) =>
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: source }) => {
            const modelCopy = H.newEntityId();
            const actionCopy = H.newEntityId();

            H.declareDataAppActions(APP_ROOT(), [
              {
                exportName: "CreateScore",
                sourceActionId: source.id,
                copiedActionEntityId: actionCopy,
              },
            ]);
            H.writeDataAppResources(APP_ROOT(), {
              collection: H.resourceCollection(
                COLLECTION,
                "Data App: Synced Actions App",
              ),
              cards: [
                H.resourceCard({
                  entityId: modelCopy,
                  name: MODEL_NAME,
                  type: "model",
                  collection: COLLECTION,
                  table: SCOREBOARD_TABLE,
                }),
              ],
              actions: [
                H.resourceImplicitAction({
                  entityId: actionCopy,
                  name: "Create",
                  kind: "row/create",
                  collection: COLLECTION,
                  model: modelCopy,
                }),
              ],
            });

            return H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) =>
              cy.wrap({ app, actionCopy }, { log: false }),
            );
          },
        ),
      );

    it("exports the action and model an author copies, as serialization writes them", () => {
      cy.get<number>("@modelId").then((modelId) =>
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: create }) => {
            // Executing the action reads these two, so the copy must keep them.
            cy.request("PUT", `/api/action/${create.id}`, {
              visualization_settings: {
                fields: {
                  score: { id: "score", hidden: true, defaultValue: 0 },
                },
              },
            });

            cy.request<Card>("GET", `/api/card/${modelId}`).then(
              ({ body: model }) => {
                cy.request("POST", "/api/apps/export-resources", {
                  actions: [create.id],
                }).then(({ body }) => {
                  expect(body.actions[0].entity).to.deep.include({
                    model_id: model.entity_id,
                    type: "implicit",
                  });
                  expect(body.actions[0].entity)
                    .to.have.nested.property(
                      "visualization_settings.fields.score",
                    )
                    .that.deep.include({ hidden: true, defaultValue: 0 });
                  expect(body.models[0].entity).to.deep.include({
                    entity_id: model.entity_id,
                    type: "model",
                  });
                  expect(body.models[0].entity)
                    .to.have.nested.property(
                      "dataset_query.stages[0].source-table",
                    )
                    .that.deep.equals(SCOREBOARD_TABLE);
                });
              },
            );
          },
        ),
      );
    });

    it("executes the app's copy rather than the authored action, for a member of the app's group", () => {
      publishApp().then(({ app, actionCopy }) => {
        H.addUserToGroup(app.permission_group_id, USERS.normal.email);

        cy.signInAsNormalUser();
        cy.intercept("POST", "/api/action/*/execute").as("execute");
        H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
        cy.visit(`/apps/${APP_SLUG}`);

        H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("action-execute", { timeout: 30000 }).click();
          cy.findByTestId("action-output").should("have.text", "executed");
        });

        cy.wait("@execute")
          .its("request.url")
          .should("contain", `/api/action/${actionCopy}/execute`);
      });
    });
  },
);
