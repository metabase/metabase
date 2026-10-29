import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { PortableTable } from "e2e/support/helpers";
import type { Card } from "metabase-types/api";

const { H } = cy;

const APP_SLUG = "synced-app";
const APP_DISPLAY_NAME = "Synced App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedAppCollection01";
const QUESTION_ENTITY_ID = "syncedAppOrdersCount1";

const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

/** The saved question an author writes, which the app's typed schema defines as `ordersCount`. */
const ORDERS_COUNT_QUESTION = H.dataAppRepresentations.card({
  entityId: QUESTION_ENTITY_ID,
  name: "OrdersCount",
  type: "question",
  collection: COLLECTION,
  table: ORDERS_TABLE,
  stage: {
    aggregation: [["count", { "lib/uuid": crypto.randomUUID() }]],
    breakout: [
      [
        "field",
        { "lib/uuid": crypto.randomUUID() },
        [...ORDERS_TABLE, "USER_ID"],
      ],
    ],
  },
});

/**
 * An app imported from a repository runs the saved question its typed schema
 * defines, which the pull loaded into the app's collection.
 */
describe("scenarios > data apps > resources from a repository", () => {
  const removeTestFiles = () =>
    cy.task("removeDataAppPaths", {
      paths: [`${APP_ROOT()}/collections`],
    });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.createLibrary();
    H.publishTables({ table_ids: [SAMPLE_DATABASE.ORDERS_ID] });

    removeTestFiles();
    H.writeDataAppResources(APP_ROOT(), {
      collection: H.dataAppRepresentations.collection(
        COLLECTION,
        "Data App: Synced App",
      ),
      cards: [ORDERS_COUNT_QUESTION],
    });
  });

  after(() => {
    removeTestFiles();
  });

  /** Publishes the fixture, uploads its bundle, and yields the app with the ID of the card it must now run. */
  const publishApp = () =>
    H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) =>
      H.uploadDataAppBundle(app).then(() =>
        cy
          .request<Card>(`/api/card/${QUESTION_ENTITY_ID}`)
          .then(({ body: card }) =>
            cy.wrap({ app, cardId: card.id }, { log: false }),
          ),
      ),
    );

  it("runs the saved question its definition names", () => {
    publishApp().then(({ cardId }) => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.visit(`/apps/${APP_SLUG}`);

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("synced-app-total", { timeout: 30000 }).should(
          ($total) => {
            expect(Number($total.text())).to.be.greaterThan(0);
          },
        );
      });

      cy.wait("@dataset").then(({ request }) => {
        const [stage] = request.body.stages ?? [];
        expect(stage?.["source-card"], "runs the saved question").to.eq(cardId);
      });
    });
  });

  it("serves the app to a member of its permission group", () => {
    publishApp().then(({ app }) => {
      H.assignTestGroupToDataApp(app).then((groupId) => {
        H.addUserToGroup(groupId, USERS.normal.email);
      });

      cy.signInAsNormalUser();
      cy.visit(`/apps/${APP_SLUG}`);

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("synced-app-total", { timeout: 30000 }).should(
          ($total) => {
            expect(Number($total.text())).to.be.greaterThan(0);
          },
        );
      });
    });
  });
});
