import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  createDataAppApiKey,
  dataAppHostAppRoot,
  declareDataAppActions,
  removeDataAppActionDeclaration,
  resetDataAppHostAppSources,
  syncDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";

/** `syncResources` takes the app's slug from its directory name. */
const APP_SLUG = "vite-6-data-app-host-app";

const APP_ROOT = () => dataAppHostAppRoot();

/**
 * Drives the real `sync-resources` CLI against a live instance, so the copies it
 * makes are checked against Metabase itself rather than a fake of its API. The
 * unit suite covers the decision logic; this covers the contract — that Metabase
 * accepts the model and action payloads synchronization sends, and that removing
 * a declaration removes exactly the copy it owns.
 */
describe(
  "Embedding SDK: data-app sync-resources (actions)",
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

      resetDataAppHostAppSources();
      createDataAppApiKey().as("apiKey");
    });

    after(() => {
      resetDataAppHostAppSources();
    });

    const sync = () =>
      cy.get<string>("@apiKey").then((apiKey) => {
        syncDataAppResources(apiKey, APP_ROOT()).then(({ ok, error }) => {
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

    /** Runs a sync that must be refused, and returns the message it refused with. */
    const syncExpectingRefusal = (message: string) =>
      cy.get<string>("@apiKey").then((apiKey) => {
        syncDataAppResources(apiKey, APP_ROOT()).should(({ ok, error }) => {
          expect(ok, "sync-resources should have refused").to.eq(false);
          expect(error).to.contain(message);
        });
      });

    /** Declares one implicit action on the fixture model, without syncing yet. */
    const declareOneAction = () =>
      cy.get<number>("@modelId").then((modelId) =>
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: action }) => {
            declareDataAppActions(APP_ROOT(), [action.id]);
            return cy.wrap({ modelId, action }, { log: false });
          },
        ),
      );

    /** Syncs one declared action and hands back the copies Metabase now holds. */
    const syncOneAction = () =>
      declareOneAction().then(({ modelId, action }) => {
        sync();
        return copiedModels().then(([copiedModel]) =>
          actionsOnModel(copiedModel.id).then(([copiedAction]) =>
            cy.wrap(
              { modelId, action, copiedModel, copiedAction },
              { log: false },
            ),
          ),
        );
      });

    it("copies a model once for its actions, then unwinds as declarations go", () => {
      cy.get<number>("@modelId").then((modelId) => {
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: create }) => {
            H.createImplicitAction({ model_id: modelId, kind: "update" }).then(
              ({ body: update }) => {
                declareDataAppActions(APP_ROOT(), [create.id, update.id]);

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
                cy.readFile(`${APP_ROOT()}/actions/orders.action.ts`).should(
                  "match",
                  /copiedActionId: \d+/,
                );

                cy.readFile(`${APP_ROOT()}/resources_metadata.json`).then(
                  (lockfile) => {
                    expect(lockfile.models).to.have.length(1);
                    expect(lockfile.models[0].actions).to.have.length(2);
                  },
                );

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
                removeDataAppActionDeclaration(APP_ROOT(), update.id);
                sync();

                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  actionsOnModel(models[0].id).then((actions) => {
                    expect(actions).to.have.length(1);
                  });
                });

                // Dropping the last one takes the copied model with it.
                removeDataAppActionDeclaration(APP_ROOT(), create.id);
                sync();

                copiedModels().should("have.length", 0);
                cy.readFile(`${APP_ROOT()}/resources_metadata.json`).then(
                  (lockfile) => {
                    expect(lockfile.models).to.have.length(0);
                  },
                );
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
            declareDataAppActions(APP_ROOT(), [action.id]);
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

    describe("recovery", () => {
      it("reuses the existing copy when the generated ID is missing", () => {
        syncOneAction().then(({ action, copiedModel, copiedAction }) => {
          // Rewriting the declarations drops the injected ID, as a bad merge would.
          declareDataAppActions(APP_ROOT(), [action.id]);
          sync();

          actionsOnModel(copiedModel.id).then((actions) => {
            expect(actions).to.have.length(1);
            expect(actions[0].id, "the copy is reused, not replaced").to.eq(
              copiedAction.id,
            );
          });
          cy.readFile(`${APP_ROOT()}/actions/orders.action.ts`).should(
            "contain",
            `copiedActionId: ${copiedAction.id}`,
          );
        });
      });

      it("recreates only the copied action when it is deleted in Metabase", () => {
        syncOneAction().then(({ copiedModel, copiedAction }) => {
          cy.request("DELETE", `/api/action/${copiedAction.id}`);
          sync();

          copiedModels().then((models) => {
            expect(models, "the model survives").to.have.length(1);
            expect(models[0].id).to.eq(copiedModel.id);

            actionsOnModel(models[0].id).then((actions) => {
              expect(actions).to.have.length(1);
              expect(actions[0].id).not.to.eq(copiedAction.id);
            });
          });
        });
      });

      it("recreates the copied model when it is deleted in Metabase", () => {
        syncOneAction().then(({ copiedModel }) => {
          cy.request("DELETE", `/api/card/${copiedModel.id}`);
          sync();

          copiedModels().then((models) => {
            expect(models).to.have.length(1);
            expect(models[0].id).not.to.eq(copiedModel.id);
          });
        });
      });
    });

    describe("refusals", () => {
      // `GET /api/action/:id` filters archived actions out, so an archived source
      // is unreadable rather than readable-and-flagged.
      it("copies nothing when a declared action is unreadable", () => {
        declareOneAction().then(({ action }) => {
          cy.request("PUT", `/api/action/${action.id}`, { archived: true });

          syncExpectingRefusal(`Could not read action ${action.id}`);
          copiedModels().should("have.length", 0);
        });
      });

      // The lockfile's own validation is unit-tested exhaustively; what matters
      // here is that a rejected lockfile stops the CLI before it mutates
      // anything, rather than being treated as "no copies exist yet".
      it("refuses to sync against a lockfile it cannot trust", () => {
        syncOneAction().then(({ copiedModel, copiedAction }) => {
          cy.writeFile(`${APP_ROOT()}/resources_metadata.json`, "{ not json");

          syncExpectingRefusal("Could not read resources_metadata.json");

          copiedModels().then((models) => {
            expect(models, "the copies are left alone").to.have.length(1);
            expect(models[0].id).to.eq(copiedModel.id);

            actionsOnModel(models[0].id).then((actions) => {
              expect(actions).to.have.length(1);
              expect(actions[0].id).to.eq(copiedAction.id);
            });
          });
        });
      });

      it("refuses to touch a copy that left the app collection", () => {
        syncOneAction().then(({ copiedModel }) => {
          cy.request("POST", "/api/collection", { name: "Elsewhere" }).then(
            ({ body: collection }) => {
              cy.request("PUT", `/api/card/${copiedModel.id}`, {
                collection_id: collection.id,
              });

              syncExpectingRefusal(`Move card ${copiedModel.id} back to`);
              // Refusing is only worth anything if the card is left alone.
              cy.request(`/api/card/${copiedModel.id}`)
                .its("body.collection_id")
                .should("eq", collection.id);
            },
          );
        });
      });

      it("refuses to touch a copy that is no longer a model", () => {
        syncOneAction().then(({ copiedModel }) => {
          cy.request("PUT", `/api/card/${copiedModel.id}`, {
            type: "question",
          });

          syncExpectingRefusal("is no longer a model");
        });
      });

      // Converting the parent model to a question deletes its implicit actions
      // and archives the rest (see `card.clj`), so the source becomes unreadable
      // rather than readable-with-a-non-model-parent.
      it("copies nothing once the parent model becomes a question", () => {
        declareOneAction().then(({ modelId, action }) => {
          cy.request("PUT", `/api/card/${modelId}`, { type: "question" });

          syncExpectingRefusal(`Could not read action ${action.id}`);
          copiedModels().should("have.length", 0);
        });
      });

      it("refuses to delete a copied action repointed at another model", () => {
        cy.get<number>("@modelId").then((modelId) => {
          H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
            ({ body: create }) => {
              H.createImplicitAction({
                model_id: modelId,
                kind: "update",
              }).then(({ body: update }) => {
                declareDataAppActions(APP_ROOT(), [create.id, update.id]);
                sync();

                copiedModels().then(([copiedModel]) => {
                  actionsOnModel(copiedModel.id).then((actions) => {
                    const copyOfUpdate = actions.find(
                      (candidate: { name: string }) =>
                        candidate.name === "Update",
                    );

                    // Repointed at the source model, which the app does not
                    // own — deleting it would destroy someone else's action.
                    cy.request("PUT", `/api/action/${copyOfUpdate.id}`, {
                      model_id: modelId,
                    });
                    removeDataAppActionDeclaration(APP_ROOT(), update.id);

                    syncExpectingRefusal(
                      `no longer hangs off copied model ${copiedModel.id}`,
                    );
                    cy.request(`/api/action/${copyOfUpdate.id}`)
                      .its("status")
                      .should("eq", 200);
                  });
                });
              });
            },
          );
        });
      });
    });
  },
);
