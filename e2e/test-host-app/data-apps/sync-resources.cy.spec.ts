import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Card, Collection, DataApp } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

/** `syncResources` takes the app's slug from its directory name. */
const APP_SLUG = "vite-6-data-app-host-app";

/** The fields these specs read off a card the app collection holds. */
type AppCard = { id: number; name: string; collection_id: number | null };

const APP_ROOT = () => H.dataAppHostAppRoot();
const LOCKFILE = () => `${APP_ROOT()}/resources_metadata.json`;
const QUERIES_FILE = () => `${APP_ROOT()}/queries/orders.query.ts`;
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;

const AUTHORED_MANIFEST = `name: Vite 6 Data App
path: ./dist/index.js
allowed_hosts:
  - https://allowed.data-app.test
`;

/**
 * The query half of `sync-resources`, run against the dev host app: a real vite
 * data app with the published SDK installed, so `defineQuery` resolves through
 * the package an author actually consumes rather than a stub.
 */
describe("Embedding SDK: data-app sync-resources (queries)", () => {
  const resetHostAppSources = () => {
    H.resetDataAppHostAppSources();
    cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    // The query and actions specs share a checked-in host app, so start clean.
    resetHostAppSources();
    H.createDataAppApiKey().as("apiKey");
  });

  after(() => {
    resetHostAppSources();
  });

  const sync = () =>
    cy.get<string>("@apiKey").then((apiKey) => {
      H.syncDataAppResources(apiKey, APP_ROOT()).then(({ ok, error }) => {
        expect(error, "sync-resources failed").to.eq(null);
        expect(ok).to.eq(true);
      });
    });

  const syncExpectingRefusal = (message: string) =>
    cy.get<string>("@apiKey").then((apiKey) => {
      H.syncDataAppResources(apiKey, APP_ROOT()).should(({ ok, error }) => {
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
        .request<{
          data: AppCard[];
        }>(`/api/collection/${app.resource_collection_id}/items?models=card`)
        .then(({ body }) => body.data);
    });

  /** Declares one query and syncs it, handing back the card Metabase created. */
  const syncOneQuery = () => {
    H.declareDataAppQueries(APP_ROOT(), [
      { name: "Orders", tableId: ORDERS_ID },
    ]);
    sync();
    return savedQuestions().should("have.length", 1).its("0");
  };

  it("names the definition whose query Metabase could not resolve", () => {
    H.declareDataAppQueries(APP_ROOT(), [{ name: "Orders", tableId: 999999 }]);

    syncExpectingRefusal("Could not resolve queries/orders.query.ts:Orders");

    savedQuestions().should("have.length", 0);
  });

  it("creates the saved question, writes its ID back, and re-syncs without changes", () => {
    H.declareDataAppQueries(APP_ROOT(), [
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
      H.removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
      sync();

      savedQuestions().should("have.length", 0);
      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.queries).to.have.length(0);
      });
    });
  });

  // Removing a declaration deletes the copy and its lockfile entry, but the ID the
  // sync wrote into the source stays in source control. Bringing the declaration
  // back has to make a fresh copy: there is no card left to adopt.
  it("re-creates the copy when a removed declaration comes back naming the deleted card", () => {
    syncOneQuery().then((card) => {
      cy.readFile(QUERIES_FILE()).then((authored: string) => {
        expect(
          authored,
          "the sync wrote the copy's ID into the source",
        ).to.contain(`savedQuestionSourceId: ${card.id}`);

        H.removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
        sync();
        savedQuestions().should("have.length", 0);

        // Exactly what restoring the file from source control brings back.
        cy.writeFile(QUERIES_FILE(), authored);
        sync();

        savedQuestions().then((recreated) => {
          expect(recreated).to.have.length(1);
          expect(
            recreated[0].id,
            "the deleted card is not resurrected",
          ).not.to.eq(card.id);
          cy.readFile(QUERIES_FILE())
            .should("contain", `savedQuestionSourceId: ${recreated[0].id}`)
            .should("not.contain", `savedQuestionSourceId: ${card.id}`);
        });
      });
    });
  });

  it("names the trash when a restored declaration points at a trashed copy", () => {
    syncOneQuery().then((card) => {
      cy.readFile(QUERIES_FILE()).then((authored: string) => {
        cy.request("PUT", `/api/card/${card.id}`, { archived: true });

        H.removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
        sync();
        cy.readFile(LOCKFILE()).then((lockfile) => {
          expect(lockfile.queries, "the entry is dropped").to.have.length(0);
        });

        cy.writeFile(QUERIES_FILE(), authored);
        syncExpectingRefusal(`card ${card.id}, which is in the trash`);
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

  describe("trashed metric copies", () => {
    beforeEach(() => {
      H.createQuestion({
        name: "Count of orders",
        type: "metric",
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
        display: "scalar",
      })
        .its("body.id")
        .as("sourceMetricId");

      cy.log("define a query that uses metrics");
      cy.get<number>("@sourceMetricId").then((id) => {
        cy.writeFile(
          QUERIES_FILE(),
          [
            'import { defineQuery } from "@metabase/embedding-sdk-react/data-app";',

            "export const OrdersCount = defineQuery({",
            `  source: { type: "table", id: ${ORDERS_ID} },`,
            `  aggregations: [{ type: "metric", id: ${id}, sourceTableId: ${ORDERS_ID} }],`,
            "});",
          ].join("\n"),
        );
      });

      sync();

      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.metrics).to.have.length(1);
        expect(lockfile.queries).to.have.length(1);

        cy.wrap(lockfile.metrics[0].copiedMetricId).as("copiedMetricId");
        cy.wrap(lockfile.queries[0].savedQuestionSourceId).as("questionId");
      });

      cy.log("archive the copied metric");
      cy.get<number>("@copiedMetricId").then((id) => {
        cy.request<Card>(`/api/card/${id}`).its("body").as("metricCopy");

        H.archiveQuestion(id);
      });

      cy.get<Card>("@metricCopy").then((copy) => {
        cy.log("the copied metric is archived");

        cy.request<Card>(`/api/card/${copy.id}`).should(({ body }) => {
          expect(body.archived).to.eq(true);
          expect(body.collection_id).not.to.eq(copy.collection_id);
        });
      });
    });

    it("restores a trashed metric copy after sync", () => {
      sync();

      cy.get<Card>("@metricCopy").then((copy) => {
        cy.log("the archived metric should no longer be archived after sync");

        cy.request<Card>(`/api/card/${copy.id}`).should(({ body }) => {
          expect(body.archived).to.eq(false);
          expect(body.collection_id).to.eq(copy.collection_id);
        });

        cy.log("the copied metric in the lockfile remains the same");
        cy.readFile(LOCKFILE())
          .its("metrics.0.copiedMetricId")
          .should("eq", copy.id);
      });

      cy.get<number>("@questionId").then((id) => H.visitQuestion(id));

      H.assertQueryBuilderRowCount(1);
    });

    it("leaves a trashed metric copy in trash after its source is removed", () => {
      H.removeDataAppQueryDeclaration(APP_ROOT(), "OrdersCount");

      sync();

      cy.get<number>("@copiedMetricId").then((id) => {
        cy.log("the copied metric should remain archived after sync");
        cy.request<Card>(`/api/card/${id}`)
          .its("body.archived")
          .should("eq", true);
      });

      cy.readFile(LOCKFILE()).should((lockfile) => {
        expect(lockfile.metrics).to.deep.eq([]);
        expect(lockfile.queries).to.deep.eq([]);
      });

      cy.get<number>("@sourceMetricId").then((id) => {
        cy.log("the source metric should not be archived");
        cy.request<Card>(`/api/card/${id}`)
          .its("body.archived")
          .should("eq", false);
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
      H.declareDataAppQueries(APP_ROOT(), [
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
      H.removeDataAppQueryDeclaration(APP_ROOT(), "Orders");

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
          H.removeDataAppQueryDeclaration(APP_ROOT(), "Orders");

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
    it("removes the app's resources and preserves its assigned group", () => {
      syncOneQuery().as("card");
      H.assignDataAppTestGroup(APP_SLUG).as("groupId");
      cy.request<DataApp>(`/api/apps/${APP_SLUG}`).its("body").as("app");

      cy.request("DELETE", `/api/apps/${APP_SLUG}`);

      cy.get<number>("@groupId").then((groupId) => {
        cy.request(`/api/permissions/group/${groupId}`)
          .its("body.id")
          .should("eq", groupId);
      });

      cy.get<DataApp>("@app").then(({ resource_collection_id }) => {
        cy.request({
          url: `/api/collection/${resource_collection_id}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 404);
      });
      cy.get<AppCard>("@card").then(({ id }) => {
        cy.request({ url: `/api/card/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404);
      });
    });

    // Everything the CLI drives is superuser-gated, starting with the draft it
    // asks for first, so a key that is not an admin's gets nowhere.
    it("refuses to synchronize at all for a key that is not an admin's", () => {
      H.declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID },
      ]);

      cy.request("POST", "/api/api-key", {
        name: `data-app-sync-e2e-non-admin-${Date.now()}`,
        group_id: USER_GROUPS.COLLECTION_GROUP,
      }).then(({ body: key }) => {
        H.syncDataAppResources(key.unmasked_key, APP_ROOT()).should(
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
  });

  describe("two apps on one instance", () => {
    const OTHER_SLUG = "sync-resources-second-app";

    it("keeps each app's copies in its own collection, reachable only by its assigned groups", () => {
      const otherRoot = H.createSecondDataApp(OTHER_SLUG);

      syncOneQuery().as("card");
      H.declareDataAppQueries(otherRoot, [
        { name: "OtherOrders", tableId: ORDERS_ID },
      ]);
      cy.get<string>("@apiKey")
        .then((apiKey) => H.syncDataAppResources(apiKey, otherRoot))
        .then(({ error }) => {
          expect(error, "second app sync failed").to.eq(null);
        });

      cy.request<DataApp>(`/api/apps/${OTHER_SLUG}`).its("body").as("otherApp");
      H.assignDataAppTestGroup(APP_SLUG).as("groupId");
      cy.get<number>("@groupId").then((groupId) =>
        H.addUserToGroup(groupId, USERS.normal.email),
      );

      cy.get<DataApp>("@otherApp")
        .then(({ resource_collection_id }) => {
          expect(
            resource_collection_id,
            "the second app has its own collection",
          ).to.be.a("number");
          return cy.request(
            `/api/collection/${resource_collection_id}/items?models=card`,
          );
        })
        .its("body.data")
        .should("have.length", 1)
        .its("0")
        .as("otherCard");

      cy.get<AppCard>("@card").then(({ id }) => {
        cy.get<AppCard>("@otherCard").its("id").should("not.equal", id);
      });

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) => {
        cy.request(`/api/card/${id}`).its("body.id").should("eq", id);
      });
      cy.get<AppCard>("@otherCard").then(({ id }) => {
        cy.request({ url: `/api/card/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 403);
      });
    });
  });

  describe("the build guard", () => {
    /** `cy.exec` reports the command's output; vite prints this only on success. */
    const expectBuildToSucceed = () =>
      H.buildDataAppHostApp().should((result) => {
        expect(`${result.stdout}${result.stderr}`).to.contain("built in");
      });

    // `metabase-resource-sync-check` runs on buildStart, so a stale app is
    // refused before it can be bundled and served.
    it("refuses to build when the source and the lockfile disagree", () => {
      syncOneQuery().then(() => {
        expectBuildToSucceed();

        // A hand-edited declaration no longer matches its lockfile entry.
        H.declareDataAppQueries(APP_ROOT(), [
          { name: "Orders", tableId: ORDERS_ID, limit: 3 },
        ]);

        H.buildDataAppHostApp().should((result) => {
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
    beforeEach(() => {
      syncOneQuery().as("card");
    });

    const joinAppGroup = () => {
      H.assignDataAppTestGroup(APP_SLUG).as("groupId");
      return cy
        .get<number>("@groupId")
        .then((groupId) => H.addUserToGroup(groupId, USERS.normal.email));
    };

    it("does not let a viewer modify the copy it can read", () => {
      joinAppGroup();

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) => {
        cy.request(`/api/card/${id}`).its("body.id").should("eq", id);

        cy.request({
          method: "PUT",
          url: `/api/card/${id}`,
          body: { name: "Renamed by a viewer" },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
        cy.request({
          method: "DELETE",
          url: `/api/card/${id}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });

    // Sync reasserts access for assigned groups, including over an admin's manual grant.
    it("takes back access an admin granted an unassigned group on the app collection", () => {
      cy.request<DataApp>(`/api/apps/${APP_SLUG}`).its("body").as("app");
      cy.get<DataApp>("@app").then(({ resource_collection_id }) => {
        if (resource_collection_id === null) {
          throw new Error("The synchronized app has no resource collection");
        }
        H.setDataAppCollectionAccess(resource_collection_id, "read");
      });

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy.request(`/api/card/${id}`).its("body.id").should("eq", id),
      );

      cy.signInAsAdmin();
      sync();

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy
          .request({ url: `/api/card/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 403),
      );
    });

    it("grants the group nothing beyond the app's own collection", () => {
      cy.request<Collection>("POST", "/api/collection", { name: "Private" })
        .its("body")
        .as("privateCollection");
      cy.get<Collection>("@privateCollection").then(({ id }) =>
        H.setDataAppCollectionAccess(id, "none"),
      );
      cy.get<Collection>("@privateCollection")
        .then(({ id }) =>
          H.createQuestion({
            name: "Private question",
            query: { "source-table": ORDERS_ID },
            collection_id: id,
          }),
        )
        .its("body")
        .as("unrelatedCard");
      joinAppGroup();

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy.request(`/api/card/${id}`).its("body.id").should("eq", id),
      );
      cy.get<Card>("@unrelatedCard").then(({ id }) =>
        cy
          .request({ url: `/api/card/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 403),
      );
    });

    it("leaves the group with no copy to read once the declaration is removed", () => {
      joinAppGroup();

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy.request(`/api/card/${id}`).its("body.id").should("eq", id),
      );

      cy.signInAsAdmin();
      H.removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
      sync();

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy
          .request({ url: `/api/card/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404),
      );
    });

    it("lets members of an assigned group read the copy while other users cannot", () => {
      H.assignDataAppTestGroup(APP_SLUG).as("groupId");

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy
          .request({ url: `/api/card/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 403),
      );

      cy.signInAsAdmin();
      cy.get<number>("@groupId").then((groupId) =>
        H.addUserToGroup(groupId, USERS.normal.email),
      );

      cy.signInAsNormalUser();
      cy.get<AppCard>("@card").then(({ id }) =>
        cy.request(`/api/card/${id}`).its("body.id").should("eq", id),
      );
    });

    it("tells a viewer outside the group that the app is not theirs to open", () => {
      cy.signInAsNormalUser();
      H.openDataApp(APP_SLUG);

      H.main()
        .findByText("You don’t have access to this data app")
        .should("be.visible");
      cy.get("iframe").should("not.exist");
    });
  });
});
