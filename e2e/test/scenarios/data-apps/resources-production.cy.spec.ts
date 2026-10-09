import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { PortableTable } from "e2e/support/helpers";
import type { Card } from "metabase-types/api";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const APP_SLUG = "synced-app";
const APP_DISPLAY_NAME = "Synced App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedAppCollection01";
const QUESTION = "syncedAppOrdersCount1";

const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

/**
 * The definition as source control holds it. `id` is the sample database's
 * ORDERS table, written from the same constant, so a snapshot change fails
 * loudly rather than silently.
 */
const DECLARATION = [
  "import {",
  "  aggregations,",
  "  breakout,",
  "  defineQuery,",
  '} from "@metabase/embedding-sdk-react/data-app";',
  "",
  "const OrdersUserId = {",
  '  type: "column" as const,',
  `  fieldId: ${ORDERS.USER_ID},`,
  `  tableId: ${ORDERS_ID},`,
  '  name: "USER_ID",',
  '  displayName: "User ID",',
  '  jsType: "number",',
  "};",
  "",
  "export const OrdersCount = defineQuery({",
  `  savedQuestionEntityId: "${QUESTION}",`,
  `  source: { type: "table", id: ${ORDERS_ID} },`,
  "  aggregations: [aggregations.count()],",
  "  breakouts: [breakout(OrdersUserId)],",
  "});",
  "",
].join("\n");

/** The saved question an author writes for `OrdersCount`. */
const ORDERS_COUNT_QUESTION = H.dataAppRepresentations.card({
  entityId: QUESTION,
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
 * What a shipped data app actually does: outside the dev preview
 * `isDataAppDev()` is false, so the SDK runs the saved question the definition
 * names, the only resource an app's viewers are permitted to read, rather than
 * the authored source. The question reaches Metabase the way it does for an
 * author: written into the app's collection files, committed, and loaded by a repository pull.
 */
describe("scenarios > data apps > resources in production", () => {
  const removeTestFiles = () =>
    cy.task("removeDataAppPaths", {
      paths: [`${APP_ROOT()}/queries`, `${APP_ROOT()}/collections`],
    });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    removeTestFiles();
    cy.task("writeDataAppFiles", {
      files: { [`${APP_ROOT()}/queries/orders.query.ts`]: DECLARATION },
    });
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

  /** Publishes the fixture and yields the app with the ID of the card it must now run. */
  const publishApp = () =>
    H.publishDataApp(APP_ROOT(), APP_SLUG).then((app) =>
      cy
        .request<Card>(`/api/card/${QUESTION}`)
        .then(({ body: card }) =>
          cy.wrap({ app, cardId: card.id }, { log: false }),
        ),
    );

  it("runs the saved question rather than the authored table query, and both return the same rows", () => {
    publishApp().then(({ cardId }) => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
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
        expect(stage?.["source-table"], "not the authored table").to.eq(
          undefined,
        );
      });

      // The swap is only safe if the saved question the author wrote returns what
      // the definition does. The dev preview runs the definition; production runs
      // the card. A deployed app cannot run the definition at all, so the two sides
      // are captured separately rather than side by side.
      cy.log("the saved question returns the same rows as the authored query");
      cy.request("POST", "/api/dataset", {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.USER_ID, null]],
        },
      }).then(({ body: authored }) => {
        cy.request("POST", `/api/card/${cardId}/query`).then(
          ({ body: published }) => {
            expect(published.data.rows).to.deep.eq(authored.data.rows);
            expect(
              published.data.rows[0][1],
              "a match on two empty results would be vacuous",
            ).to.be.greaterThan(0);
          },
        );
      });
    });
  });

  it("serves the app to a member of its permission group", () => {
    publishApp().then(({ app }) => {
      H.assignTestGroupToDataApp(app.name).then((groupId) => {
        H.addUserToGroup(groupId, USERS.normal.email);
      });

      cy.signInAsNormalUser();
      H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
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
