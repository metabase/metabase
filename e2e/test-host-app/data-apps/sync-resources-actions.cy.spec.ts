import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  addUserToGroup,
  createDataAppApiKey,
  createDataAppCollection,
  createDataAppScoreboardAction,
  dataAppHostAppRoot,
  dataAppPermissionGroupId,
  declareDataAppActions,
  removeDataAppActionDeclaration,
  resetDataAppHostAppSources,
  syncDataAppResources,
} from "e2e/support/helpers";
import type { WritebackAction } from "metabase-types/api";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";

/** The `slug` the app's `data_app.yaml` declares. */
const APP_SLUG = "vite-6-data-app-host-app";

const APP_ROOT = () => dataAppHostAppRoot();

const PARAMETERS = { team_name: "Data App FC", score: 7 };

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

    /** The actions Metabase holds in the app's own collection. */
    const copiedActions = () =>
      cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
        expect(app.resource_collection_id, "resource collection").to.be.a(
          "number",
        );
        return cy
          .request<WritebackAction[]>("/api/action")
          .then(({ body }) =>
            body.filter(
              (action) => action.collection_id === app.resource_collection_id,
            ),
          );
      });

    /** Runs a sync that must be refused, and returns the message it refused with. */
    const syncExpectingRefusal = (message: string) =>
      cy.get<string>("@apiKey").then((apiKey) => {
        syncDataAppResources(apiKey, APP_ROOT()).should(({ ok, error }) => {
          expect(ok, "sync-resources should have refused").to.eq(false);
          expect(error).to.contain(message);
        });
      });

    /** Declares one action, without syncing yet. */
    const declareOneAction = () =>
      createDataAppScoreboardAction().then((action) => {
        declareDataAppActions(APP_ROOT(), [action.id]);
        return cy.wrap(action, { log: false });
      });

    /** Syncs one declared action and hands back the copy Metabase now holds. */
    const syncOneAction = () =>
      declareOneAction().then((action) => {
        sync();
        return copiedActions().then(([copiedAction]) =>
          cy.wrap({ action, copiedAction }, { log: false }),
        );
      });

    it("copies each declared action into the app collection, then deletes each copy as its declaration is removed", () => {
      createDataAppScoreboardAction({ name: "Add team" }).then((add) => {
        createDataAppScoreboardAction({ name: "Add rival" }).then((rival) => {
          declareDataAppActions(APP_ROOT(), [add.id, rival.id]);

          sync();

          copiedActions().then((actions) => {
            expect(actions).to.have.length(2);
            actions.forEach((copy) => {
              expect(copy.model_id, "a copy belongs to no model").to.eq(null);
              expect([add.id, rival.id]).not.to.include(copy.id);
            });
          });

          // Injected back into source: the ID a production build runs.
          cy.readFile(`${APP_ROOT()}/actions/orders.action.ts`).should(
            "match",
            /copiedActionId: \d+/,
          );

          cy.readFile(`${APP_ROOT()}/resources_metadata.json`).then(
            (lockfile) => {
              expect(lockfile.actions).to.have.length(2);
            },
          );

          sync();
          copiedActions().should("have.length", 2);

          removeDataAppActionDeclaration(APP_ROOT(), rival.id);
          sync();
          copiedActions().should("have.length", 1);

          removeDataAppActionDeclaration(APP_ROOT(), add.id);
          sync();
          copiedActions().should("have.length", 0);
          cy.readFile(`${APP_ROOT()}/resources_metadata.json`).then(
            (lockfile) => {
              expect(lockfile.actions).to.have.length(0);
            },
          );
        });
      });
    });

    it("updates the copy in place when the source action changes", () => {
      syncOneAction().then(({ action, copiedAction }) => {
        cy.request("PUT", `/api/action/${action.id}`, {
          description: "now documented",
        });

        sync();

        copiedActions().then((actions) => {
          expect(actions).to.have.length(1);
          expect(actions[0].id).to.eq(copiedAction.id);
          expect(actions[0].description).to.eq("now documented");
        });
      });
    });

    it("leaves the copy untouched when nothing changed", () => {
      syncOneAction().then(({ copiedAction }) => {
        sync();

        copiedActions().then(([action]) => {
          expect(action.id).to.eq(copiedAction.id);
          expect(action.updated_at, "the copy was not rewritten").to.eq(
            copiedAction.updated_at,
          );
        });
      });
    });

    it("restores a copy edited directly in Metabase", () => {
      syncOneAction().then(({ copiedAction }) => {
        cy.request("PUT", `/api/action/${copiedAction.id}`, {
          name: "Edited by hand",
        });

        sync();

        copiedActions().then((actions) => {
          expect(actions).to.have.length(1);
          expect(actions[0].id).to.eq(copiedAction.id);
          expect(actions[0].name).to.eq(copiedAction.name);
        });
      });
    });

    describe("permissions", () => {
      const joinAppGroup = () =>
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          addUserToGroup(groupId, USERS.normal.email);
          return cy.wrap(groupId, { log: false });
        });

      // The copy is the whole point: an app's viewers hold read on the app's
      // collection, so only the copy is reachable to them.
      it("lets the app's group execute the copy but not the action it was copied from", () => {
        createDataAppCollection({
          name: "Source actions",
          access: "none",
        }).then((collection) => {
          createDataAppScoreboardAction({
            collectionId: collection.id,
          }).then((action) => {
            declareDataAppActions(APP_ROOT(), [action.id]);
            sync();
            joinAppGroup();

            copiedActions().then(([copiedAction]) => {
              cy.signInAsNormalUser();
              cy.request({
                method: "POST",
                url: `/api/action/${copiedAction.id}/execute`,
                body: { parameters: PARAMETERS },
              })
                .its("status")
                .should("be.oneOf", [200, 204]);

              // The same request against the source, so the two are like for like.
              cy.request({
                method: "POST",
                url: `/api/action/${action.id}/execute`,
                body: { parameters: PARAMETERS },
                failOnStatusCode: false,
              })
                .its("status")
                .should("eq", 403);
            });
          });
        });
      });

      it("reports a copy that was deleted in Metabase without being re-synced", () => {
        syncOneAction().then(({ copiedAction }) => {
          joinAppGroup();

          // The source still names this copy, but a production bundle built
          // before the deletion keeps addressing it.
          cy.request("DELETE", `/api/action/${copiedAction.id}`);

          cy.signInAsNormalUser();
          cy.request({
            method: "POST",
            url: `/api/action/${copiedAction.id}/execute`,
            body: { parameters: PARAMETERS },
            failOnStatusCode: false,
          })
            .its("status")
            .should("eq", 404);
        });
      });
    });

    describe("recovery", () => {
      it("reuses the existing copy when copiedActionId is missing from the source", () => {
        syncOneAction().then(({ action, copiedAction }) => {
          // Rewriting the declarations drops the injected ID, as a bad merge would.
          declareDataAppActions(APP_ROOT(), [action.id]);
          sync();

          copiedActions().then((actions) => {
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

      it("recreates the copy when it is deleted in Metabase", () => {
        syncOneAction().then(({ copiedAction }) => {
          cy.request("DELETE", `/api/action/${copiedAction.id}`);
          sync();

          copiedActions().then((actions) => {
            expect(actions).to.have.length(1);
            expect(actions[0].id).not.to.eq(copiedAction.id);
          });
        });
      });
    });

    describe("refusals", () => {
      // `GET /api/action/:id` filters archived actions out, so an archived source
      // is unreadable rather than readable-and-flagged.
      it("copies nothing when a declared action is archived and cannot be read", () => {
        declareOneAction().then((action) => {
          cy.request("PUT", `/api/action/${action.id}`, { archived: true });

          syncExpectingRefusal(`Could not read action ${action.id}`);
          copiedActions().should("have.length", 0);
        });
      });

      it("copies nothing when a declared action belongs to a model", () => {
        H.createModelFromTableName({
          tableName: TEST_TABLE,
          modelName: "Scoreboard model",
        });
        cy.get<number>("@modelId").then((modelId) =>
          H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
            ({ body: action }) => {
              declareDataAppActions(APP_ROOT(), [action.id]);

              syncExpectingRefusal("is not a query action without a model");
              copiedActions().should("have.length", 0);
            },
          ),
        );
      });

      // Validation itself is unit-tested; what matters here is that a rejected
      // lockfile stops the CLI before it mutates anything.
      it("refuses to sync when resources_metadata.json is corrupt, leaving the copy alone", () => {
        syncOneAction().then(({ copiedAction }) => {
          cy.writeFile(`${APP_ROOT()}/resources_metadata.json`, "{ not json");

          syncExpectingRefusal("Could not read resources_metadata.json");

          copiedActions().then((actions) => {
            expect(actions, "the copy is left alone").to.have.length(1);
            expect(actions[0].id).to.eq(copiedAction.id);
          });
        });
      });

      it("refuses to sync when a copy was moved out of the app collection", () => {
        syncOneAction().then(({ copiedAction }) => {
          cy.request("POST", "/api/collection", {
            name: "Elsewhere",
            namespace: "data-actions",
          }).then(({ body: collection }) => {
            cy.request("PUT", `/api/action/${copiedAction.id}`, {
              collection_id: collection.id,
            });

            syncExpectingRefusal(
              `Action ${copiedAction.id} is the copy of action`,
            );
            // Refusing is only worth anything if the copy is left alone.
            cy.request(`/api/action/${copiedAction.id}`)
              .its("body.collection_id")
              .should("eq", collection.id);
          });
        });
      });
    });
  },
);
