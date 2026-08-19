import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addUserToGroup,
  buildDataAppHostApp,
  createDataAppApiKey,
  createSecondDataApp,
  dataAppHostAppRoot,
  dataAppPermissionGroupId,
  declareDataAppQueries,
  getPermissionByGroup,
  getViewDataPermissionByGroup,
  removeDataAppQueryDeclaration,
  setDataAppCollectionAccess,
  syncDataAppResources,
} from "e2e/support/helpers";
import type { DataApp } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

/** `syncResources` takes the app's slug from its directory name. */
const APP_SLUG = "vite-6-data-app-host-app";

/** The fields these specs read off a card the app collection holds. */
type AppCard = { id: number; name: string; collection_id: number | null };

const APP_ROOT = () => dataAppHostAppRoot();
const LOCKFILE = () => `${APP_ROOT()}/resources_metadata.json`;
const QUERIES_FILE = () => `${APP_ROOT()}/queries/orders.query.ts`;

/**
 * The query half of `sync-resources`, run against the dev host app: a real vite
 * data app with the published SDK installed, so `defineQuery` resolves through
 * the package an author actually consumes rather than a stub.
 */
describe("Embedding SDK: data-app sync-resources (queries)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    // The app is a checked-in directory, so leave no generated state behind.
    cy.exec(`rm -rf ${APP_ROOT()}/queries ${LOCKFILE()}`);
    createDataAppApiKey().as("apiKey");
  });

  after(() => {
    cy.exec(`rm -rf ${dataAppHostAppRoot()}/queries`);
    cy.exec(`rm -f ${dataAppHostAppRoot()}/resources_metadata.json`);
  });

  const sync = () =>
    cy.get<string>("@apiKey").then((apiKey) => {
      syncDataAppResources(apiKey, APP_ROOT()).then(({ ok, error }) => {
        expect(error, "sync-resources failed").to.eq(null);
        expect(ok).to.eq(true);
      });
    });

  const syncExpectingRefusal = (message: string) =>
    cy.get<string>("@apiKey").then((apiKey) => {
      syncDataAppResources(apiKey, APP_ROOT()).should(({ ok, error }) => {
        expect(ok, "sync-resources should have refused").to.eq(false);
        expect(error).to.contain(message);
      });
    });

  /** The saved questions Metabase holds in the app's own collection. */
  const savedQuestions = () =>
    cy.request<DataApp>(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
      expect(app.resource_collection_id, "resource collection").to.be.a(
        "number",
      );
      return cy
        .request<{ data: AppCard[] }>(
          `/api/collection/${app.resource_collection_id}/items?models=card`,
        )
        .then(({ body }) => body.data);
    });

  /** Declares one query and syncs it, handing back the card Metabase created. */
  const syncOneQuery = () => {
    declareDataAppQueries(APP_ROOT(), [{ name: "Orders", tableId: ORDERS_ID }]);
    sync();
    return savedQuestions().then(([card]) => cy.wrap(card, { log: false }));
  };

  it("names the definition whose query Metabase could not resolve", () => {
    declareDataAppQueries(APP_ROOT(), [{ name: "Orders", tableId: 999999 }]);

    syncExpectingRefusal("Could not resolve queries/orders.query.ts:Orders");

    savedQuestions().should("have.length", 0);
  });

  it("creates the saved question, writes its ID back, and re-syncs without changes", () => {
    declareDataAppQueries(APP_ROOT(), [
      { name: "Orders", tableId: ORDERS_ID, limit: 5 },
    ]);

    sync();

    savedQuestions().then((cards) => {
      expect(cards).to.have.length(1);

      cy.readFile(QUERIES_FILE()).should(
        "contain",
        `savedQuestionSourceId: ${cards[0].id}`,
      );
      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.queries).to.have.length(1);
        expect(lockfile.queries[0].savedQuestionSourceId).to.eq(cards[0].id);
      });

      sync();
      savedQuestions().then((after) => {
        expect(after).to.have.length(1);
        expect(after[0].id).to.eq(cards[0].id);
      });
    });
  });

  it("deletes the saved question when its declaration is removed", () => {
    syncOneQuery().then(() => {
      removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
      sync();

      savedQuestions().should("have.length", 0);
      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.queries).to.have.length(0);
      });
    });
  });

  it("restores a hand-edited card's name instead of replacing the card", () => {
    syncOneQuery().then((card) => {
      cy.request("PUT", `/api/card/${card.id}`, { name: "Renamed by hand" });

      sync();

      savedQuestions().then((cards) => {
        expect(cards, "the card is updated in place").to.have.length(1);
        expect(cards[0].id).to.eq(card.id);
        expect(cards[0].name).to.eq("Orders");
      });
    });
  });

  it("brings back a saved question that was trashed on its own", () => {
    syncOneQuery().then((card) => {
      cy.request("PUT", `/api/card/${card.id}`, { archived: true });

      sync();

      cy.request(`/api/card/${card.id}`).then(({ body: restored }) => {
        expect(restored.archived, "the copy is out of the trash").to.eq(false);
        expect(restored.collection_id).to.eq(card.collection_id);
      });
    });
  });

  it("recreates the saved question after it is deleted in Metabase", () => {
    syncOneQuery().then((card) => {
      cy.request("DELETE", `/api/card/${card.id}`);

      sync();

      savedQuestions().then((cards) => {
        expect(cards).to.have.length(1);
        expect(cards[0].id).not.to.eq(card.id);
      });
      cy.readFile(QUERIES_FILE()).should("not.contain", `Id: ${card.id}`);
    });
  });

  it("restores savedQuestionSourceId from the lockfile when the source loses it", () => {
    syncOneQuery().then((card) => {
      // Rewriting the declaration drops the injected ID, as a bad merge would.
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID },
      ]);

      sync();

      savedQuestions().then((cards) => {
        expect(cards, "the card is reused, not replaced").to.have.length(1);
        expect(cards[0].id).to.eq(card.id);
      });
      cy.readFile(QUERIES_FILE()).should(
        "contain",
        `savedQuestionSourceId: ${card.id}`,
      );
    });
  });

  it("rebuilds a missing lockfile entry from the ID left in the source", () => {
    syncOneQuery().then((card) => {
      cy.writeFile(LOCKFILE(), { queries: [], models: [] });

      sync();

      // The inline ID proves ownership, so the entry is rebuilt.
      savedQuestions().then((cards) => {
        expect(cards).to.have.length(1);
        expect(cards[0].id).to.eq(card.id);
      });
      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.queries).to.have.length(1);
        expect(lockfile.queries[0].savedQuestionSourceId).to.eq(card.id);
      });
    });
  });

  // A card in the trash reports the Trash as its collection, so one moved out
  // and trashed afterwards is indistinguishable from the app's own. Deleting is
  // permanent, so neither is deleted.
  it("leaves a trashed card in the trash when its declaration is removed", () => {
    syncOneQuery().then((card) => {
      cy.request("PUT", `/api/card/${card.id}`, { archived: true });
      removeDataAppQueryDeclaration(APP_ROOT(), "Orders");

      sync();

      cy.request(`/api/card/${card.id}`)
        .its("body.archived")
        .should("eq", true);
      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.queries, "no longer tracked").to.have.length(0);
      });
    });
  });

  it("refuses to delete a card that was moved out of the app collection", () => {
    syncOneQuery().then((card) => {
      cy.request("POST", "/api/collection", { name: "Elsewhere" }).then(
        ({ body: collection }) => {
          cy.request("PUT", `/api/card/${card.id}`, {
            collection_id: collection.id,
          });
          removeDataAppQueryDeclaration(APP_ROOT(), "Orders");

          syncExpectingRefusal(`Move card ${card.id} back to`);
          cy.request(`/api/card/${card.id}`)
            .its("body.collection_id")
            .should("eq", collection.id);
        },
      );
    });
  });

  // Trashing the collection archives everything in it, and the app is served
  // from those copies, so a sync that reports success has not actually recovered.
  it("brings the app collection and its copies back out of the trash", () => {
    syncOneQuery().then((card) => {
      cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
        cy.request("PUT", `/api/collection/${app.resource_collection_id}`, {
          archived: true,
        });
        cy.request(`/api/card/${card.id}`)
          .its("body.archived")
          .should("eq", true);

        sync();

        cy.request(`/api/collection/${app.resource_collection_id}`)
          .its("body.archived")
          .should("eq", false);
        cy.request(`/api/card/${card.id}`)
          .its("body.archived")
          .should("eq", false);
      });
    });
  });

  describe("the app's lifecycle", () => {
    it("takes the collection and the group with it when the app is removed", () => {
      syncOneQuery().then((card) => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
            cy.request("DELETE", `/api/apps/${APP_SLUG}`);

            // Nothing is left for a former viewer to reach.
            cy.request({
              url: `/api/collection/${app.resource_collection_id}`,
              failOnStatusCode: false,
            })
              .its("status")
              .should("eq", 404);
            cy.request({
              url: `/api/permissions/group/${groupId}`,
              failOnStatusCode: false,
            })
              .its("status")
              .should("eq", 404);
            cy.request({ url: `/api/card/${card.id}`, failOnStatusCode: false })
              .its("status")
              .should("eq", 404);
          });
        });
      });
    });

    // Everything the CLI drives is superuser-gated, starting with the draft it
    // asks for first, so a key that is not an admin's gets nowhere.
    it("refuses to synchronize at all for a key that is not an admin's", () => {
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID },
      ]);

      cy.request("POST", "/api/api-key", {
        name: `data-app-sync-e2e-non-admin-${Date.now()}`,
        group_id: USER_GROUPS.COLLECTION_GROUP,
      }).then(({ body: key }) => {
        syncDataAppResources(key.unmasked_key, APP_ROOT()).should(
          ({ ok, error }) => {
            expect(ok, "sync-resources should have refused").to.eq(false);
            expect(error).to.contain("403");
            expect(error, "refused at the first call it makes").to.contain(
              `/api/apps/${APP_SLUG}/draft`,
            );
          },
        );

        // The draft call is the one that creates the app, so a refusal leaves
        // nothing behind at all — not even the app to hold copies.
        cy.request({ url: `/api/apps/${APP_SLUG}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404);
      });
    });

    it("refuses to reconcile permissions for a key that is not an admin's", () => {
      syncOneQuery().then(() => {
        cy.request({
          method: "POST",
          url: "/api/api-key",
          body: {
            name: `data-app-sync-e2e-non-admin-${Date.now()}`,
            group_id: USER_GROUPS.COLLECTION_GROUP,
          },
        }).then(({ body: key }) => {
          // The key has to be the only credential: a session cookie would
          // authenticate the request as the admin who is signed in.
          cy.clearCookies();

          // The CLI authenticates with a key, so the endpoint it drives has to
          // refuse one that does not belong to an admin.
          cy.request({
            method: "PUT",
            url: `/api/apps/${APP_SLUG}/resources/permissions`,
            body: { database_ids: [SAMPLE_DB_ID] },
            headers: { "x-api-key": key.unmasked_key },
            failOnStatusCode: false,
          })
            .its("status")
            .should("eq", 403);
        });
      });
    });
  });

  describe("two apps on one instance", () => {
    const OTHER_SLUG = "sync-resources-second-app";

    it("keeps each app's copies in its own collection, reachable only by its own group", () => {
      const otherRoot = createSecondDataApp(OTHER_SLUG);

      syncOneQuery().then((card) => {
        declareDataAppQueries(otherRoot, [
          { name: "OtherOrders", tableId: ORDERS_ID },
        ]);
        cy.get<string>("@apiKey").then((apiKey) => {
          syncDataAppResources(apiKey, otherRoot).then(({ error }) => {
            expect(error, "second app sync failed").to.eq(null);
          });
        });

        cy.request(`/api/apps/${OTHER_SLUG}`).then(({ body: otherApp }) => {
          dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
            expect(
              otherApp.resource_collection_id,
              "each app gets its own collection",
            ).not.to.eq(null);
            expect(otherApp.permission_group_id).not.to.eq(groupId);

            // Joining one app's group must not reach the other app's copy.
            addUserToGroup(groupId, USERS.normal.email);

            cy.request(
              `/api/collection/${otherApp.resource_collection_id}/items?models=card`,
            ).then(({ body }) => {
              const otherCard = body.data[0];
              expect(otherCard.id, "the apps hold different cards").not.to.eq(
                card.id,
              );

              cy.signInAsNormalUser();
              cy.request(`/api/card/${card.id}`)
                .its("body.id")
                .should("eq", card.id);
              cy.request({
                url: `/api/card/${otherCard.id}`,
                failOnStatusCode: false,
              })
                .its("status")
                .should("eq", 403);
            });
          });
        });
      });
    });
  });

  describe("the build guard", () => {
    /** `cy.exec` reports the command's output; vite prints this only on success. */
    const expectBuildToSucceed = () =>
      buildDataAppHostApp().should((result) => {
        expect(`${result.stdout}${result.stderr}`).to.contain("built in");
      });

    // `metabase-resource-sync-check` runs on buildStart, so a stale app is
    // refused before it can be bundled and served.
    it("refuses to build when the source and the lockfile disagree", () => {
      syncOneQuery().then(() => {
        expectBuildToSucceed();

        // A hand-edited declaration no longer matches its lockfile entry.
        declareDataAppQueries(APP_ROOT(), [
          { name: "Orders", tableId: ORDERS_ID, limit: 3 },
        ]);

        buildDataAppHostApp().should((result) => {
          const output = `${result.stdout}${result.stderr}`;
          expect(output, "the build is refused").to.contain(
            "is not synchronized",
          );
          expect(output).not.to.contain("built in");
        });

        // Synchronizing makes it buildable again.
        sync();
        expectBuildToSucceed();
      });
    });
  });

  describe("permissions", () => {
    /** Puts the normal user in the app's group, as granting app access does. */
    const joinAppGroup = () =>
      dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
        addUserToGroup(groupId, USERS.normal.email);
        return cy.wrap(groupId, { log: false });
      });

    // View-data alone would let a viewer author their own questions against the
    // whole database, so synchronization also pins create-queries to "no".
    it("gives the group data to read but no right to write queries with it", () => {
      syncOneQuery().then(() => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          getPermissionByGroup(groupId).should((graph) => {
            const database = graph[String(SAMPLE_DB_ID)];

            expect(database?.["view-data"], "data is readable").to.eq(
              "unrestricted",
            );
            // The graph reports only what departs from a group's defaults, and
            // "no" is the default — so anything else here would mean the group
            // had been granted query authoring over the whole database.
            expect(
              database?.["create-queries"] ?? "no",
              "no query authoring",
            ).to.eq("no");
          });
        });
      });
    });

    it("does not let a viewer modify the copy it can read", () => {
      syncOneQuery().then((card) => {
        joinAppGroup();

        cy.signInAsNormalUser();
        cy.request(`/api/card/${card.id}`).its("body.id").should("eq", card.id);

        // The grant is collection read, never readwrite.
        cy.request({
          method: "PUT",
          url: `/api/card/${card.id}`,
          body: { name: "Renamed by a viewer" },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
        cy.request({
          method: "DELETE",
          url: `/api/card/${card.id}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });

    // The app collection is server-owned, so each sync reasserts exclusive
    // access — including over a grant an admin made deliberately.
    it("takes back access an admin granted another group on the app collection", () => {
      syncOneQuery().then((card) => {
        cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
          setDataAppCollectionAccess(app.resource_collection_id, "read");

          cy.signInAsNormalUser();
          cy.request(`/api/card/${card.id}`)
            .its("body.id")
            .should("eq", card.id);

          cy.signInAsAdmin();
          sync();

          cy.signInAsNormalUser();
          cy.request({ url: `/api/card/${card.id}`, failOnStatusCode: false })
            .its("status")
            .should("eq", 403);
        });
      });
    });

    it("grants the group nothing beyond the app's own collection", () => {
      cy.request("POST", "/api/collection", { name: "Private" }).then(
        ({ body: collection }) => {
          // The normal user belongs to groups that can read new collections, so
          // close this one: the claim under test is that joining the app group
          // grants the app's collection and nothing else.
          setDataAppCollectionAccess(collection.id, "none");

          H.createQuestion({
            name: "Private question",
            query: { "source-table": ORDERS_ID },
            collection_id: collection.id,
          }).then(({ body: unrelated }) => {
            syncOneQuery().then((card) => {
              joinAppGroup();

              cy.signInAsNormalUser();
              cy.request(`/api/card/${card.id}`)
                .its("body.id")
                .should("eq", card.id);
              cy.request({
                url: `/api/card/${unrelated.id}`,
                failOnStatusCode: false,
              })
                .its("status")
                .should("eq", 403);
            });
          });
        },
      );
    });

    it("leaves the group with nothing once the declaration is removed", () => {
      syncOneQuery().then((card) => {
        joinAppGroup();

        cy.signInAsNormalUser();
        cy.request(`/api/card/${card.id}`).its("body.id").should("eq", card.id);

        cy.signInAsAdmin();
        removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
        sync();

        // The copy is deleted with its declaration, so there is nothing left to
        // read — the group's collection grant now covers an empty collection.
        cy.signInAsNormalUser();
        cy.request({ url: `/api/card/${card.id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404);
      });
    });

    // The copy exists so an app's viewers can read it: they are given the app's
    // own group, which holds read on the app's collection and nothing else.
    it("lets the app's group read the copy while the rest of the instance cannot", () => {
      syncOneQuery().then((card) => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          cy.signInAsNormalUser();
          cy.request({ url: `/api/card/${card.id}`, failOnStatusCode: false })
            .its("status")
            .should("eq", 403);

          cy.signInAsAdmin();
          addUserToGroup(groupId, USERS.normal.email);

          cy.signInAsNormalUser();
          cy.request(`/api/card/${card.id}`)
            .its("body.id")
            .should("eq", card.id);
        });
      });
    });

    // `read-check-data-app` 403s a non-member, and the app view turns that status
    // into its own empty state instead of loading the bundle.
    it("tells a viewer outside the group that the app is not theirs to open", () => {
      syncOneQuery().then(() => {
        cy.signInAsNormalUser();
        cy.visit(`/apps/${APP_SLUG}`);

        cy.findByText("You don’t have access to this data app").should("exist");
        cy.get("iframe").should("not.exist");
      });
    });

    it("grants the group view-data on the database its queries read", () => {
      syncOneQuery().then(() => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          getViewDataPermissionByGroup(groupId).should(
            ({ [String(SAMPLE_DB_ID)]: sampleDatabase }) => {
              expect(sampleDatabase).to.eq("unrestricted");
            },
          );
        });
      });
    });

    it("stops granting view-data once no declaration reads the database", () => {
      syncOneQuery().then(() => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          getViewDataPermissionByGroup(groupId).should(
            ({ [String(SAMPLE_DB_ID)]: sampleDatabase }) => {
              expect(sampleDatabase, "granted by the first sync").to.eq(
                "unrestricted",
              );
            },
          );

          removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
          sync();

          // The graph reports only what departs from a group's defaults, so a
          // database the app no longer reads drops out of it entirely.
          getViewDataPermissionByGroup(groupId).should(
            ({ [String(SAMPLE_DB_ID)]: sampleDatabase }) => {
              expect(sampleDatabase, "revoked by the second sync").not.to.eq(
                "unrestricted",
              );
            },
          );
        });
      });
    });
  });
});
