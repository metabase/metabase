import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  createDataAppApiKey,
  createDataAppSyncFixture,
  dataAppSyncFixtureRoot,
  declareDataAppActions,
  removeDataAppActionDeclaration,
  syncDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";

/** `syncResources` takes the app's slug from its directory name. */
const APP_SLUG = "sync-resources-app";

/**
 * Drives the real `sync-resources` CLI against a live instance, so the copies it
 * makes are checked against Metabase itself rather than a fake of its API. The
 * unit suite covers the decision logic; this covers the contract — that Metabase
 * accepts the model and action payloads synchronization sends, and that removing
 * a declaration removes exactly the copy it owns.
 */
describe(
  "scenarios > data apps > sync-resources",
  { tags: ["@external", "@actions"] },
  () => {
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

      createDataAppSyncFixture();
      createDataAppApiKey().as("apiKey");
    });

    const sync = () =>
      cy.get<string>("@apiKey").then((apiKey) => {
        syncDataAppResources(apiKey).then(({ ok, error }) => {
          expect(error, "sync-resources failed").to.eq(null);
          expect(ok).to.eq(true);
        });
      });

    /** The models Metabase holds in the app's own collection. */
    const copiedModels = () =>
      cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
        expect(app.resource_collection_id, "resource collection").to.be.a(
          "number",
        );
        return cy
          .request(
            `/api/collection/${app.resource_collection_id}/items?models=dataset`,
          )
          .then(({ body }) => body.data);
      });

    const actionsOnModel = (modelId: number) =>
      cy.request(`/api/action?model-id=${modelId}`).then(({ body }) => body);

    it("copies a model once for its actions, then unwinds as declarations go", () => {
      cy.get<number>("@modelId").then((modelId) => {
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: create }) => {
            H.createImplicitAction({ model_id: modelId, kind: "update" }).then(
              ({ body: update }) => {
                declareDataAppActions([create.id, update.id]);

                sync();

                // Both actions belong to one model, so exactly one copy is made
                // and the second action reuses it.
                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  const copiedModelId = models[0].id;
                  expect(copiedModelId).not.to.eq(modelId);

                  actionsOnModel(copiedModelId).then((actions) => {
                    expect(actions).to.have.length(2);
                  });
                });

                // The generated IDs are written back into the source, which is
                // what a production build executes.
                cy.readFile(
                  `${dataAppSyncFixtureRoot()}/actions/orders.action.ts`,
                ).should("match", /copiedActionId: \d+/);

                cy.readFile(
                  `${dataAppSyncFixtureRoot()}/resources_metadata.json`,
                ).then((lockfile) => {
                  expect(lockfile.models).to.have.length(1);
                  expect(lockfile.models[0].actions).to.have.length(2);
                });

                // Re-running with the same declarations changes nothing.
                sync();
                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  actionsOnModel(models[0].id).then((actions) => {
                    expect(actions).to.have.length(2);
                  });
                });

                // Dropping one declaration removes only that copy: the model is
                // still needed by its sibling.
                removeDataAppActionDeclaration(update.id);
                sync();

                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  actionsOnModel(models[0].id).then((actions) => {
                    expect(actions).to.have.length(1);
                  });
                });

                // Dropping the last one takes the copied model with it.
                removeDataAppActionDeclaration(create.id);
                sync();

                copiedModels().should("have.length", 0);
                cy.readFile(
                  `${dataAppSyncFixtureRoot()}/resources_metadata.json`,
                ).then((lockfile) => {
                  expect(lockfile.models).to.have.length(0);
                });
              },
            );
          },
        );
      });
    });

    it("updates the existing copies when the source drifts", () => {
      cy.get<number>("@modelId").then((modelId) => {
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: action }) => {
            declareDataAppActions([action.id]);
            sync();

            copiedModels().then(([copy]) => {
              cy.request("PUT", `/api/card/${modelId}`, {
                name: `${MODEL_NAME} renamed`,
              });
              cy.request("PUT", `/api/action/${action.id}`, {
                description: "now documented",
              });

              sync();

              // The copies are updated in place: no second model is made, and
              // the copied action keeps the ID already injected into the source.
              copiedModels().then((models) => {
                expect(models).to.have.length(1);
                expect(models[0].id).to.eq(copy.id);
                expect(models[0].name).to.eq(`${MODEL_NAME} renamed`);

                actionsOnModel(models[0].id).then((actions) => {
                  expect(actions).to.have.length(1);
                  expect(actions[0].description).to.eq("now documented");
                });
              });
            });
          },
        );
      });
    });

    // `GET /api/action/:id` filters archived actions out, so an archived source
    // is unreadable rather than readable-and-flagged. The reconciler copies
    // nothing at all when any declaration cannot be resolved.
    it("copies nothing when a declared action is unreadable", () => {
      cy.get<number>("@modelId").then((modelId) => {
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: action }) => {
            cy.request("PUT", `/api/action/${action.id}`, { archived: true });
            declareDataAppActions([action.id]);

            cy.get<string>("@apiKey").then((apiKey) => {
              syncDataAppResources(apiKey).should(({ ok, error }) => {
                expect(ok, "sync-resources should have refused").to.eq(false);
                expect(error).to.contain(`Could not read action ${action.id}`);
              });
            });

            copiedModels().should("have.length", 0);
          },
        );
      });
    });
  },
);
