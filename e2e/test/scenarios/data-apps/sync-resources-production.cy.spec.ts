import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addUserToGroup,
  createDataAppApiKey,
  dataAppIframe,
  dataAppPermissionGroupId,
  mockDataApp,
  syncDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const APP_SLUG = "synced-app";
const APP_DISPLAY_NAME = "Synced App";

interface UserIdRowsResponse {
  data: { rows: Array<[number]> };
}

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;
const QUERY_FILE = () => `${APP_ROOT()}/queries/orders.query.ts`;
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;
const LOCKFILE = () => `${APP_ROOT()}/resources_metadata.json`;

/** The manifest as source control holds it, before a sync writes entity IDs into it. */
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
  // Sync writes entity IDs into the manifest and a lockfile beside it. `H.restore()`
  // drops what those IDs name, so leftovers fail the next run's sync.
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
    createDataAppApiKey().as("apiKey");
  });

  after(() => {
    restoreAuthoredFixture();
  });

  /** Synchronizes the fixture and returns the card the app must now address. */
  const syncApp = () =>
    cy.get<string>("@apiKey").then((apiKey) =>
      syncDataAppResources(apiKey, APP_ROOT()).then(({ ok, error }) => {
        expect(error, "sync-resources failed").to.eq(null);
        expect(ok).to.eq(true);

        return cy
          .readFile(`${APP_ROOT()}/resources_metadata.json`)
          .then((lockfile) => {
            const cardId = lockfile.queries?.[0]?.savedQuestionSourceId;

            if (typeof cardId !== "number") {
              throw new Error("The sync wrote no query entry to the lockfile.");
            }

            return cy.wrap(cardId, { log: false });
          });
      }),
    );

  it("runs the synchronized card rather than the authored table query", () => {
    syncApp().then((cardId) => {
      cy.readFile(QUERY_FILE()).should(
        "contain",
        `savedQuestionSourceId: ${cardId}`,
      );

      cy.intercept("POST", "/api/dataset").as("dataset");
      mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
      cy.visit(`/apps/${APP_SLUG}`);

      dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("synced-app-total", { timeout: 30000 }).should(
          ($total) => {
            expect(Number($total.text())).to.be.greaterThan(0);
          },
        );
      });

      // The proof that production took the synchronized path: the query runs
      // against the copied card, not the table the declaration names.
      cy.wait("@dataset").then(({ request }) => {
        const [stage] = request.body.stages ?? [];
        expect(stage?.["source-card"], "runs the synchronized card").to.eq(
          cardId,
        );
        expect(stage?.["source-table"], "not the authored table").to.be
          .undefined;
      });
    });
  });

  // The swap is only safe if both sides return the same thing. The dev preview
  // runs the authored query unswapped; production runs the card it was published
  // as. A deployed app cannot run the authored query at all, so the two sides are
  // captured separately rather than side by side.
  it("returns the same rows from the published card as from the authored query", () => {
    syncApp().then((cardId) => {
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
    syncApp().then(() => {
      dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
        addUserToGroup(groupId, USERS.normal.email);

        cy.signInAsNormalUser();
        mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
        cy.visit(`/apps/${APP_SLUG}`);

        dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("synced-app-total", { timeout: 30000 }).should(
            ($total) => {
              expect(Number($total.text())).to.be.greaterThan(0);
            },
          );
        });
      });
    });
  });

  it("preserves sandboxing from other groups when data app applies table permissions", () => {
    // A user in the orders table that should show up when sandboxed.
    const SANDBOXED_USER_ID = Number(USERS.sandboxed.login_attributes.attr_uid);

    // A user in the orders table that should not show up when sandboxed.
    cy.request<UserIdRowsResponse>("POST", "/api/dataset", {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.USER_ID, null]],
        filter: ["!=", ["field", ORDERS.USER_ID, null], SANDBOXED_USER_ID],
        limit: 1,
      },
    }).then(({ body }) => {
      const nonSandboxedUserId = body.data.rows[0]?.[0];

      if (nonSandboxedUserId === undefined) {
        throw new Error("The orders table has no other user with orders.");
      }

      return cy.wrap(nonSandboxedUserId).as("nonSandboxedUserId");
    });

    H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
    H.blockUserGroupPermissions(USER_GROUPS.COLLECTION_GROUP);

    cy.request<{ id: number }>("POST", "/api/permissions/group", {
      name: "Sandboxed data app viewer",
    }).then(({ body: { id: sandboxGroupId } }) => {
      cy.sandboxTable({
        group_id: sandboxGroupId,
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      addUserToGroup(sandboxGroupId, USERS.sandboxed.email);
    });

    syncApp();
    mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });

    dataAppPermissionGroupId(APP_SLUG).then((dataAppGroupId) =>
      addUserToGroup(dataAppGroupId, USERS.sandboxed.email),
    );

    cy.signInAsSandboxedUser();
    cy.visit(`/apps/${APP_SLUG}`);

    dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.get<number>("@nonSandboxedUserId").then((nonSandboxedUserId) => {
        cy.log(
          `Should only show the sandboxed user ${SANDBOXED_USER_ID}, not ${nonSandboxedUserId}.`,
        );

        cy.findByTestId("synced-app-visible-user-ids", {
          timeout: 30000,
        })
          .should("not.contain", String(nonSandboxedUserId))
          .and("have.text", String(SANDBOXED_USER_ID));
      });
    });
  });
});
