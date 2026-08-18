import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createDataAppApiKey,
  dataAppHostAppRoot,
  declareDataAppQueries,
  removeDataAppQueryDeclaration,
  syncDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

/** `syncResources` takes the app's slug from its directory name. */
const APP_SLUG = "vite-6-data-app-host-app";

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
    cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
      expect(app.resource_collection_id, "resource collection").to.be.a(
        "number",
      );
      return cy
        .request(
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

  it("grants the app's group view-data on the database its queries read", () => {
    syncOneQuery().then(() => {
      cy.request(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
        cy.request("/api/permissions/graph").then(({ body: graph }) => {
          expect(
            graph.groups[app.permission_group_id][SAMPLE_DB_ID]["view-data"],
          ).to.eq("unrestricted");
        });
      });
    });
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
});
