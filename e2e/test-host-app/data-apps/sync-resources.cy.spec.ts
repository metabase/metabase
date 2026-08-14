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
 *
 * The action half stays in the main suite because implicit actions need a
 * writable database, and this job runs no warehouse containers.
 */
describe("Embedding SDK: data-app sync-resources", () => {
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

  it("creates a saved question, injects its ID, and is unchanged on re-sync", () => {
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

      // Re-running creates nothing further: the authored query already matches.
      sync();
      savedQuestions().then((after) => {
        expect(after).to.have.length(1);
        expect(after[0].id).to.eq(cards[0].id);
      });
    });
  });

  it("deletes the saved question when its declaration goes", () => {
    syncOneQuery().then(() => {
      removeDataAppQueryDeclaration(APP_ROOT(), "Orders");
      sync();

      savedQuestions().should("have.length", 0);
      cy.readFile(LOCKFILE()).then((lockfile) => {
        expect(lockfile.queries).to.have.length(0);
      });
    });
  });

  it("restores the card's authoritative properties without replacing it", () => {
    syncOneQuery().then((card) => {
      // Someone edits the generated question by hand in Metabase.
      cy.request("PUT", `/api/card/${card.id}`, { name: "Renamed by hand" });

      sync();

      savedQuestions().then((cards) => {
        expect(cards, "the card is updated in place").to.have.length(1);
        expect(cards[0].id).to.eq(card.id);
        expect(cards[0].name).to.eq("Orders");
      });
    });
  });

  it("recreates the saved question when it is deleted in Metabase", () => {
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

  it("restores a missing inline ID from the lockfile", () => {
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

  it("repairs the lockfile from an owned inline ID", () => {
    syncOneQuery().then((card) => {
      cy.writeFile(LOCKFILE(), { queries: [], models: [] });

      sync();

      // The inline ID proves ownership, so the entry is rebuilt rather than the
      // card being abandoned and a second one created.
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

  it("refuses to remove a card that left the app collection", () => {
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
