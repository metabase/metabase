import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
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
 * Drives the real `sync-resources` CLI against a live instance, so the copies are
 * checked against Metabase rather than a fake of its API. The unit suite covers
 * the decision logic; this covers the contract.
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

    it("copies the model once for two actions, then deletes each copy as its declaration is removed", () => {
      cy.get<number>("@modelId").then((modelId) => {
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: create }) => {
            H.createImplicitAction({ model_id: modelId, kind: "update" }).then(
              ({ body: update }) => {
                declareDataAppActions(APP_ROOT(), [create.id, update.id]);

                sync();

                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  const copiedModelId = models[0].id;
                  expect(copiedModelId).not.to.eq(modelId);

                  actionsOnModel(copiedModelId).then((actions) => {
                    expect(actions).to.have.length(2);
                  });
                });

                // Injected back into source: the ID a production build runs.
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

                sync();
                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  actionsOnModel(models[0].id).then((actions) => {
                    expect(actions).to.have.length(2);
                  });
                });

                // The model survives: its sibling still needs it.
                removeDataAppActionDeclaration(APP_ROOT(), update.id);
                sync();

                copiedModels().then((models) => {
                  expect(models).to.have.length(1);
                  actionsOnModel(models[0].id).then((actions) => {
                    expect(actions).to.have.length(1);
                  });
                });

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

    it("updates the copies in place when the source model or action changes", () => {
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

    it("leaves the copies untouched when nothing changed", () => {
      syncOneAction().then(({ copiedModel, copiedAction }) => {
        sync();

        copiedModels().then(([model]) => {
          expect(model.id).to.eq(copiedModel.id);
          expect(model.updated_at, "the model copy was not rewritten").to.eq(
            copiedModel.updated_at,
          );

          actionsOnModel(model.id).then(([action]) => {
            expect(action.id).to.eq(copiedAction.id);
            expect(
              action.updated_at,
              "the action copy was not rewritten",
            ).to.eq(copiedAction.updated_at);
          });
        });
      });
    });

    // A query action carries its own database, which need not be its model's.
    it("grants view-data on a query action's own database as well as its model's", () => {
      H.setActionsEnabledForDB(SAMPLE_DB_ID);

      cy.get<number>("@modelId").then((modelId) => {
        cy.request("POST", "/api/action", {
          name: "Report",
          type: "query",
          model_id: modelId,
          database_id: SAMPLE_DB_ID,
          dataset_query: {
            type: "native",
            database: SAMPLE_DB_ID,
            native: { query: "SELECT 1" },
          },
          parameters: [],
        }).then(({ body: action }) => {
          declareDataAppActions(APP_ROOT(), [action.id]);
          sync();

          cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
            cy.request("/api/permissions/graph").then(({ body: graph }) => {
              const granted = graph.groups[app.permission_group_id];

              expect(granted[WRITABLE_DB_ID]["view-data"]).to.eq(
                "unrestricted",
              );
              expect(granted[SAMPLE_DB_ID]["view-data"]).to.eq("unrestricted");
            });
          });
        });
      });
    });

    it("restores a copied model edited directly in Metabase", () => {
      syncOneAction().then(({ copiedModel }) => {
        cy.request("PUT", `/api/card/${copiedModel.id}`, {
          name: "Edited by hand",
        });

        sync();

        copiedModels().then((models) => {
          expect(models).to.have.length(1);
          expect(models[0].id).to.eq(copiedModel.id);
          expect(models[0].name).to.eq(MODEL_NAME);
        });
      });
    });

    it("restores a copied action edited directly in Metabase", () => {
      syncOneAction().then(({ copiedModel, copiedAction }) => {
        cy.request("PUT", `/api/action/${copiedAction.id}`, {
          name: "Edited by hand",
        });

        sync();

        actionsOnModel(copiedModel.id).then((actions) => {
          expect(actions).to.have.length(1);
          expect(actions[0].id).to.eq(copiedAction.id);
          expect(actions[0].name).to.eq(copiedAction.name);
        });
      });
    });

    describe("recovery", () => {
      it("reuses the existing copies when copiedActionId is missing from the source", () => {
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

      it("recreates the copied action but keeps its model when the action is deleted in Metabase", () => {
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

      it("recreates the copied model after it is deleted in Metabase", () => {
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
      it("copies nothing when a declared action is archived and cannot be read", () => {
        declareOneAction().then(({ action }) => {
          cy.request("PUT", `/api/action/${action.id}`, { archived: true });

          syncExpectingRefusal(`Could not read action ${action.id}`);
          copiedModels().should("have.length", 0);
        });
      });

      // Validation itself is unit-tested; what matters here is that a rejected
      // lockfile stops the CLI before it mutates anything.
      it("refuses to sync when resources_metadata.json is corrupt, leaving the copies alone", () => {
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

      it("refuses to sync when a copied model was moved out of the app collection", () => {
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

      it("refuses to sync when a copied model was converted to a question", () => {
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
      it("copies nothing when the source model was converted to a question", () => {
        declareOneAction().then(({ modelId, action }) => {
          cy.request("PUT", `/api/card/${modelId}`, { type: "question" });

          syncExpectingRefusal(`Could not read action ${action.id}`);
          copiedModels().should("have.length", 0);
        });
      });

      it("refuses to update a copied action that now belongs to another model", () => {
        syncOneAction().then(({ modelId, copiedAction }) => {
          // Still declared, but repointed at a model the app does not own:
          // replacing it would abandon an action nothing tracks.
          cy.request("PUT", `/api/action/${copiedAction.id}`, {
            model_id: modelId,
          });

          syncExpectingRefusal(
            `Action ${copiedAction.id} is the copy of action`,
          );
          cy.request(`/api/action/${copiedAction.id}`)
            .its("body.model_id")
            .should("eq", modelId);
        });
      });

      it("refuses to delete a copied action that now belongs to another model", () => {
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
