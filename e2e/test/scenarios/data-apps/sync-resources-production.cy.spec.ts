import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Dataset, DatasetQuery } from "metabase-types/api";

const { H } = cy;

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const APP_SLUG = "synced-app";
const APP_DISPLAY_NAME = "Synced App";

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;
const QUERY_FILE = () => `${APP_ROOT()}/queries/orders.query.ts`;
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;
const LOCKFILE = () => `${APP_ROOT()}/resources_metadata.json`;

/** The manifest as source control holds it. */
const AUTHORED_MANIFEST = `name: ${APP_DISPLAY_NAME}\npath: ./dist/index.js\n`;

/** The declaration as source control holds it, with no generated ID yet. */
const AUTHORED_DECLARATION = [
  "import {",
  "  aggregations,",
  "  breakout,",
  "  defineQuery,",
  '} from "@metabase/embedding-sdk-react/data-app";',
  "",
  "/**",
  " * Authored state, as it sits in source control before a sync. `id` is the sample",
  " * database's ORDERS table (`SAMPLE_DATABASE.ORDERS_ID`); the spec writes this file",
  " * from the same constant, so a snapshot change fails loudly rather than silently.",
  " * Synchronization writes `savedQuestionSourceId` in here, and the spec restores",
  " * this file afterwards.",
  " */",
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
  `  source: { type: "table", id: ${ORDERS_ID} },`,
  "  aggregations: [aggregations.count()],",
  "  breakouts: [breakout(OrdersUserId)],",
  "});",
].join("\n");

/**
 * What a shipped data app actually does: outside the dev preview `isDataAppDev()`
 * is false, so the SDK addresses the synchronized copy — the only resource an
 * app's viewers are permitted to read — rather than the authored source.
 */
describe("scenarios > data apps > sync-resources in production", () => {
  // Restore the source files and remove the lockfile before each synchronization.
  const restoreAuthoredFixture = () => {
    cy.writeFile(QUERY_FILE(), `${AUTHORED_DECLARATION}\n`);
    cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
    cy.task("removeDataAppPaths", { paths: [LOCKFILE()] });
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    restoreAuthoredFixture();
    H.createDataAppApiKey().as("apiKey");

    cy.get<string>("@apiKey")
      .then((apiKey) => H.syncDataAppResources(apiKey, APP_ROOT()))
      .then(({ ok, error }) => {
        expect(error, "sync-resources failed").to.eq(null);
        expect(ok).to.eq(true);
      });

    cy.readFile(LOCKFILE())
      .its("queries")
      .should("have.length", 1)
      .its("0.savedQuestionSourceId")
      .should("be.a", "number")
      .as("cardId");
  });

  after(() => {
    restoreAuthoredFixture();
  });

  it("runs the synchronized card and preserves the authored query's results", () => {
    cy.get<number>("@cardId").then((cardId) =>
      cy
        .readFile(QUERY_FILE())
        .should("contain", `savedQuestionSourceId: ${cardId}`),
    );

    // The dev preview runs the authored query; production must return the same rows.
    cy.request<Dataset>("POST", "/api/dataset", {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.USER_ID, null]],
      },
    })
      .its("body")
      .as("authoredResult");

    cy.get<number>("@cardId")
      .then((cardId) =>
        cy.request<Dataset>("POST", `/api/card/${cardId}/query`),
      )
      .its("body")
      .as("publishedResult");

    cy.get<Dataset>("@authoredResult").then(({ data: { rows } }) => {
      expect(rows, "authored results").not.to.be.empty;
      cy.get<Dataset>("@publishedResult")
        .its("data.rows")
        .should("deep.equal", rows);
    });

    cy.intercept("POST", "/api/dataset").as("dataset");
    H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
    H.openDataApp(APP_SLUG);

    H.dataAppIframe(APP_DISPLAY_NAME)
      .findByTestId("synced-app-total", { timeout: 30000 })
      .should("be.visible")
      .and(($total) => {
        expect(Number($total.text())).to.be.greaterThan(0);
      });

    cy.wait("@dataset").its("request.body").as("appQuery");
    cy.get<number>("@cardId").then((cardId) => {
      cy.get<DatasetQuery>("@appQuery")
        .its("stages")
        .should("have.length", 1)
        .its("0")
        .should((stage) => {
          expect(stage).to.have.property("source-card", cardId);
          expect(stage).not.to.have.property("source-table");
        });
    });
  });

  it("runs the synchronized query for a member of an assigned group", () => {
    H.assignDataAppTestGroup(APP_SLUG).as("groupId");
    cy.get<number>("@groupId").then((groupId) =>
      H.addUserToGroup(groupId, USERS.normal.email),
    );

    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
    H.openDataApp(APP_SLUG);

    cy.wait("@dataset");
    H.dataAppIframe(APP_DISPLAY_NAME)
      .findByTestId("synced-app-total", { timeout: 30000 })
      .should("be.visible")
      .and(($total) => {
        expect(Number($total.text())).to.be.greaterThan(0);
      });
  });
});
