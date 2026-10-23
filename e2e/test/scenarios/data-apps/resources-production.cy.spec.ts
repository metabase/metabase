import { USERS } from "e2e/support/cypress_data";
import type { PortableTable } from "e2e/support/helpers";
import type { Card } from "metabase-types/api";

const { H } = cy;

const APP_SLUG = "synced-app";
const APP_DISPLAY_NAME = "Synced App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedAppCollection01";
const QUESTION = "syncedAppOrdersCount1";

const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

/** The definition the app's typed schema holds for its saved question. */
const DECLARATION = [
  'import { defineQuery } from "@metabase/embedding-sdk-react/data-app";',
  "",
  "export const OrdersCount = defineQuery({",
  `  source: { type: "card", entityId: "${QUESTION}" },`,
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
 * An app imported from a repository runs the saved question its typed schema
 * names, which the pull loaded into the app's collection.
 */
describe("scenarios > data apps > resources from a repository", () => {
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

  it("runs the saved question its definition names", () => {
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
