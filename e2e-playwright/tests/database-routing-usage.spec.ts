/**
 * Playwright port of
 * e2e/test/scenarios/admin/database-routing/database-routing-usage.cy.spec.ts
 *
 * Database routing at query time: a "lead" router database with two
 * destination databases, and five users whose `destination_database` login
 * attribute picks the destination (or is `__METABASE_ROUTER__`, or wrong, or
 * missing). Covers routing for native + MBQL questions, cache isolation
 * between destinations, and the interaction with sandboxing and connection
 * impersonation.
 *
 * Infra-gated (PORTING infra-gate rule): the upstream `before()` CREATEs three
 * real postgres databases on the QA postgres container (port 5404) and
 * restores the `postgres-writable` snapshot, so the spec is gated on
 * PW_QA_DB_ENABLED. Token-gated too — see below.
 *
 * Port notes:
 * - Upstream's `before()` builds a `db-routing-3-dbs` snapshot and every
 *   `beforeEach` restores it. Ported with the established snapshot-build idiom
 *   (module-level `snapshotReady` guard in the first beforeEach; see
 *   metrics-explorer.spec.ts / dashboard-filters-with-question-revert.spec.ts).
 *   The Cypress aliases the tests read back (`this.leadDbId`, the table/field
 *   ids) become module-level variables captured during the build; they survive
 *   the restores because the snapshot contains them.
 * - `cy.get(sel).should("contain", x)` is ANY-OF over the matched collection
 *   (chai-jquery), and `cy.get` itself requires ≥1 match. Ported as
 *   "filtered subset is non-empty" / "collection non-empty AND filtered subset
 *   empty" — see expectColumnContains / expectColumnNotContains. Regex, not a
 *   bare string, so the substring match stays case-sensitive like Cypress's.
 * - `signInAs` (a bare `cy.request POST /api/session`) is issued through
 *   `context.request`, NOT through `mb.api` — see the helper's comment for the
 *   cookie-jar reason. It does not navigate, exactly like upstream.
 * - FIDELITY NOTE, upstream weakness kept verbatim: both halves of "should
 *   route users to the correct destination database" sign in as
 *   `userWithMetabaseRouterAttr` and then assert **without re-visiting the
 *   question**. The page still shows the *admin's* previously-rendered result,
 *   so "User with __METABASE_ROUTER__ should see primary db" passes no matter
 *   what that user would actually see. Neither Cypress nor Playwright reloads
 *   on a session-cookie swap, so the port reproduces the vacuity exactly rather
 *   than silently fixing it. Flagged in findings; not strengthened here.
 * - `cy.intercept`/`cy.wait` in the impersonation test → page.waitForResponse
 *   registered before the goto (PORTING rule 2), keeping the 30s timeouts.
 */
import type { BrowserContext, Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import {
  BASE_POSTGRES_DESTINATION_DB_INFO,
  configureDbRoutingViaAPI,
  createDestinationDatabasesViaAPI,
} from "../support/database-routing-admin";
import {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  DB_ROUTER_USERS,
  addPostgresDatabase,
  createDbWithIdentifierTable,
  getDbIdentifierIds,
} from "../support/database-routing-usage";
import { sandboxTable } from "../support/dashboard-repros";
import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { updatePermissionsGraph } from "../support/model-actions";
import { createUserFromRawData } from "../support/sandboxing-via-api";
import { blockUserGroupPermissions } from "../support/table-collection-permissions";
import { visitQuestion } from "../support/ui";

/** Port of DataPermissionValue (frontend/src/metabase-types/api/permissions.ts). */
const DataPermissionValue = {
  IMPERSONATED: "impersonated",
  UNRESTRICTED: "unrestricted",
} as const;

const SNAPSHOT_NAME = "db-routing-3-dbs";

// The upstream spec creates real postgres databases and connects Metabase to
// them on QA_POSTGRES_PORT; neither is available without the QA containers.
const skipUnlessQaDb = () =>
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the QA postgres container (port 5404) and the postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

// Cypress aliases from before(), captured once while the snapshot is built.
let snapshotReady = false;
let leadDbId: number;
let destinationOneDbId: number;
let leadDbIdentifierTableId: number;
let leadDbColorFieldId: number;
let destinationOneDbIdentifierTableId: number;
let destinationOneDbColorFieldId: number;

/** Port of the upstream before(). */
async function buildSnapshot(mb: {
  api: MetabaseApi;
  restore: (name?: string) => Promise<void>;
  signInAsAdmin: () => Promise<void>;
}) {
  // For DB Routing it's important all the tables have the same schema
  await createDbWithIdentifierTable({ dbName: "lead" });
  await createDbWithIdentifierTable({ dbName: "destination_one" });
  await createDbWithIdentifierTable({ dbName: "destination_two" });

  await mb.restore("postgres-writable");
  await mb.signInAsAdmin();
  await mb.api.activateToken("pro-self-hosted");
  for (const user of Object.values(DB_ROUTER_USERS)) {
    await createUserFromRawData(mb.api, user);
  }

  leadDbId = await addPostgresDatabase(mb.api, "lead", "lead");
  await configureDbRoutingViaAPI(mb.api, {
    router_database_id: leadDbId,
    user_attribute: "destination_database",
  });
  await createDestinationDatabasesViaAPI(mb.api, {
    router_database_id: leadDbId,
    databases: [
      {
        ...BASE_POSTGRES_DESTINATION_DB_INFO,
        name: "destination_one",
        details: {
          ...BASE_POSTGRES_DESTINATION_DB_INFO.details,
          dbname: "destination_one",
        },
      },
      {
        ...BASE_POSTGRES_DESTINATION_DB_INFO,
        name: "destination_two",
        details: {
          ...BASE_POSTGRES_DESTINATION_DB_INFO.details,
          dbname: "destination_two",
        },
      },
    ],
  });
  ({ tableId: leadDbIdentifierTableId, colorFieldId: leadDbColorFieldId } =
    await getDbIdentifierIds(mb.api, leadDbId));

  destinationOneDbId = await addPostgresDatabase(
    mb.api,
    "destination_one",
    "destination_one",
  );
  ({
    tableId: destinationOneDbIdentifierTableId,
    colorFieldId: destinationOneDbColorFieldId,
  } = await getDbIdentifierIds(mb.api, destinationOneDbId));

  await mb.api.snapshot(SNAPSHOT_NAME);
}

// === assertion helpers ===

const columnCells = (page: Page, column: string) =>
  page.locator(`[data-column-id="${column}"]`);

/** Case-sensitive substring, matching chai-jquery's `contain`. */
const substring = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

/**
 * Port of `cy.get('[data-column-id="X"]').should("contain", text)`:
 * cy.get requires at least one match, and `contain` on a collection is
 * satisfied if ANY element contains the text.
 */
async function expectColumnContains(page: Page, column: string, text: string) {
  await expect(
    columnCells(page, column).filter({ hasText: substring(text) }),
  ).not.toHaveCount(0);
}

/**
 * Port of `cy.get('[data-column-id="X"]').should("not.contain", text)`: no
 * element contains the text. The non-empty check is not an added assertion —
 * it is cy.get's own existence requirement, without which `toHaveCount(0)`
 * would pass vacuously on a table that never rendered.
 */
async function expectColumnNotContains(
  page: Page,
  column: string,
  text: string,
) {
  await expect(columnCells(page, column)).not.toHaveCount(0);
  await expect(
    columnCells(page, column).filter({ hasText: substring(text) }),
  ).toHaveCount(0);
}

const NO_DESTINATION_ERROR =
  "Database Routing error: No Destination Database with slug `wrong_destination` found.";
const MISSING_ATTRIBUTE_ERROR =
  "Required user attribute is missing. Cannot route to a Destination Database.";

/**
 * Port of `cy.findByTestId("query-visualization-root").findByText(msg)` —
 * findByText throws when absent AND when more than one node matches, so it is
 * an exactly-one EXISTENCE assertion. String arg → { exact: true }
 * (PORTING rule 1).
 *
 * Deliberately `toHaveCount(1)`, not `toBeVisible()`. `toBeVisible()` was tried
 * first and is a strengthening upstream never made — it fails on the MBQL half
 * of the routing test, where the message node is present but Playwright reports
 * it `hidden` (it stayed hidden for the full 10s retry window; the native half
 * of the same test reports it visible). Whatever that layout difference is, it
 * is outside what upstream asserts, so the port asserts existence and the
 * difference is recorded in findings rather than encoded here.
 */
async function expectVisualizationError(page: Page, message: string) {
  await expect(
    page
      .getByTestId("query-visualization-root")
      .getByText(message, { exact: true }),
  ).toHaveCount(1);
}

/**
 * Port of signInAs (e2e-database-routing-helpers.ts): POST /api/session and
 * leave the browser on whatever page it was already showing (upstream does not
 * navigate here).
 *
 * NOT `signInWithCredentials` (support/sandboxing-via-api.ts), even though that
 * is the obvious reuse — it issues the POST through the `mb.api` client, which
 * is backed by the test-scoped `request` fixture and therefore has its own
 * cookie jar. The /api/session response sets `metabase.SESSION` in THAT jar,
 * and `metabase.server.middleware.session/wrap-session-key` resolves
 * `:normal-cookie` BEFORE `:header` — so every subsequent `mb.api` call runs as
 * the router user no matter what `X-Metabase-Session` says, and
 * `mb.signInAsAdmin()` does not fix it (it only rewrites the *browser*
 * context's cookies and the header). Observed here as a 403 on the admin-only
 * `POST /api/card` / `GET /api/permissions/graph` calls that follow.
 *
 * Using `context.request` instead puts the session cookie in the browser
 * context's jar — which is exactly where this spec wants it, and which
 * `mb.signInAsAdmin()` does overwrite.
 */
async function signInAs(
  context: BrowserContext,
  user: { email: string; password: string },
) {
  const response = await context.request.post("/api/session", {
    data: { username: user.email, password: user.password },
  });
  expect(response.ok(), `sign in as ${user.email}`).toBeTruthy();
}

test.describe("admin > database > database routing", () => {
  skipUnlessQaDb();

  test.beforeEach(async ({ mb }) => {
    // The snapshot build creates 3 postgres databases and syncs 2 Metabase
    // databases; the tests themselves each drive ~6 sign-in + question loads.
    test.setTimeout(600_000);

    if (!snapshotReady) {
      await buildSnapshot(mb);
      snapshotReady = true;
    }

    await mb.restore(SNAPSHOT_NAME);
    await mb.signInAsAdmin();
  });

  test("should route users to the correct destination database", async ({
    page,
    context,
    mb,
  }) => {
    const { id: nativeQuestionId } = await createNativeQuestion(mb.api, {
      database: leadDbId,
      name: "Native Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    });

    // Admin should see primary db
    await visitQuestion(page, nativeQuestionId);
    await expectColumnContains(page, "name", "lead");
    await expectColumnNotContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    // User with __METABASE_ROUTER__ should see primary db
    // NOTE (fidelity): upstream does NOT re-visit the question here, so these
    // three assertions re-check the admin's already-rendered table. Kept
    // verbatim — see the spec header.
    await signInAs(context, DB_ROUTER_USERS.userWithMetabaseRouterAttr);
    await expectColumnContains(page, "name", "lead");
    await expectColumnNotContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    // User A
    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, nativeQuestionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    // User B
    await signInAs(context, DB_ROUTER_USERS.userB);
    await visitQuestion(page, nativeQuestionId);
    await expectColumnContains(page, "name", "destination_two");
    await expectColumnNotContains(page, "name", "destination_one");

    // "User A" upstream — actually the wrong-attribute user.
    await signInAs(context, DB_ROUTER_USERS.userWrongAttribute);
    await visitQuestion(page, nativeQuestionId);
    await expectVisualizationError(page, NO_DESTINATION_ERROR);

    // User with no attribute
    await signInAs(context, DB_ROUTER_USERS.userNoAttribute);
    await visitQuestion(page, nativeQuestionId);
    await expectVisualizationError(page, MISSING_ATTRIBUTE_ERROR);

    await mb.signInAsAdmin();
    const { id: mbqlQuestionId } = await mb.api.createQuestion({
      name: "DB Identifier Name",
      database: leadDbId,
      query: {
        "source-table": leadDbIdentifierTableId,
      },
    });

    // Admin should see primary db
    await visitQuestion(page, mbqlQuestionId);
    await expectColumnContains(page, "name", "lead");
    await expectColumnNotContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    // User with __METABASE_ROUTER__ should see primary db
    // NOTE (fidelity): again no re-visit upstream — see the spec header.
    await signInAs(context, DB_ROUTER_USERS.userWithMetabaseRouterAttr);
    await expectColumnContains(page, "name", "lead");
    await expectColumnNotContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, mbqlQuestionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    // "User A" upstream — actually user B.
    await signInAs(context, DB_ROUTER_USERS.userB);
    await visitQuestion(page, mbqlQuestionId);
    await expectColumnContains(page, "name", "destination_two");
    await expectColumnNotContains(page, "name", "destination_one");

    // User with wrong attribute
    await signInAs(context, DB_ROUTER_USERS.userWrongAttribute);
    await visitQuestion(page, mbqlQuestionId);
    await expectVisualizationError(page, NO_DESTINATION_ERROR);

    // User with no attribute
    await signInAs(context, DB_ROUTER_USERS.userNoAttribute);
    await visitQuestion(page, mbqlQuestionId);
    await expectVisualizationError(page, MISSING_ATTRIBUTE_ERROR);
  });

  test("should not leak cached data", async ({ page, context, mb }) => {
    const { id: questionId } = await createNativeQuestion(mb.api, {
      database: leadDbId,
      name: "Identifier Name",
      native: {
        query: "SELECT name FROM db_identifier;",
      },
    });

    await mb.api.put("/api/cache", {
      model: "question",
      model_id: questionId,
      strategy: {
        refresh_automatically: false,
        unit: "hours",
        duration: 24,
        type: "duration",
      },
    });
    // Upstream fires this GET and ignores the body; it only asserts a 2xx
    // (cy.request's default), which api.get also enforces.
    await mb.api.get(`/api/cache?model=question&id=${questionId}`);

    // User A
    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, questionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnNotContains(page, "name", "destination_two");

    // User B
    await signInAs(context, DB_ROUTER_USERS.userB);
    await visitQuestion(page, questionId);
    await expectColumnContains(page, "name", "destination_two");
    await expectColumnNotContains(page, "name", "destination_one");
  });

  test("should work with sandboxing", async ({ page, context, mb }) => {
    const { id: questionId } = await mb.api.createQuestion({
      name: "Color",
      database: leadDbId,
      query: {
        "source-table": leadDbIdentifierTableId,
      },
    });

    // Sandboxing a destination db should have no effect
    await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP, destinationOneDbId);
    await sandboxTable(mb.api, {
      table_id: destinationOneDbIdentifierTableId,
      group_id: COLLECTION_GROUP,
      attribute_remappings: {
        color: ["dimension", ["field", destinationOneDbColorFieldId]],
      },
    });

    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, questionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnContains(page, "color", "blue");
    await expectColumnContains(page, "color", "red");

    await mb.signInAsAdmin();
    await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP, leadDbId);
    await sandboxTable(mb.api, {
      table_id: leadDbIdentifierTableId,
      group_id: COLLECTION_GROUP,
      attribute_remappings: {
        color: ["dimension", ["field", leadDbColorFieldId]],
      },
    });

    // Unrestricted access on the destination db should not affect sandboxing
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [destinationOneDbId]: {
          "view-data": DataPermissionValue.UNRESTRICTED,
        },
      },
    });

    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, questionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnContains(page, "color", "blue");
    await expectColumnNotContains(page, "color", "red");

    // Test sandboxing using a question
    await mb.signInAsAdmin();
    const { id: redColorQuestionId } = await createNativeQuestion(mb.api, {
      name: "Red Color",
      database: leadDbId,
      native: {
        query: "SELECT * FROM db_identifier WHERE color='red'",
      },
    });
    await blockUserGroupPermissions(mb.api, COLLECTION_GROUP, leadDbId);
    await sandboxTable(mb.api, {
      table_id: leadDbIdentifierTableId,
      group_id: COLLECTION_GROUP,
      card_id: redColorQuestionId,
    });
    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, questionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnContains(page, "color", "red");
    await expectColumnNotContains(page, "color", "blue");
  });

  test("should work with impersonation", async ({ page, context, mb }) => {
    const { id: questionId } = await createNativeQuestion(mb.api, {
      name: "Native Color",
      database: leadDbId,
      native: {
        query: "SELECT * FROM db_identifier;",
      },
    });

    // Impersonating a destination db should have no effect
    await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP, destinationOneDbId);
    await updatePermissionsGraph(
      mb.api,
      {
        [COLLECTION_GROUP]: {
          [destinationOneDbId]: {
            "view-data": DataPermissionValue.IMPERSONATED,
          },
        },
      },
      [
        {
          db_id: destinationOneDbId,
          group_id: COLLECTION_GROUP,
          attribute: "db_role",
        },
      ],
    );

    await signInAs(context, DB_ROUTER_USERS.userA);
    await visitQuestion(page, questionId);
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnContains(page, "color", "blue");
    await expectColumnContains(page, "color", "red");

    await mb.signInAsAdmin();
    await blockUserGroupPermissions(mb.api, ALL_USERS_GROUP, leadDbId);
    await updatePermissionsGraph(
      mb.api,
      {
        [COLLECTION_GROUP]: {
          [leadDbId]: {
            "view-data": DataPermissionValue.IMPERSONATED,
          },
        },
      },
      [
        {
          db_id: leadDbId,
          group_id: COLLECTION_GROUP,
          attribute: "db_role",
        },
      ],
    );

    // Unrestricted access on the destination db should not affect impersonation
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [destinationOneDbId]: {
          "view-data": DataPermissionValue.UNRESTRICTED,
        },
      },
    });

    await signInAs(context, DB_ROUTER_USERS.userA);
    // Longer timeout: first impersonation validation triggers cold Python
    // context init (upstream comment).
    const metadataResponse = page.waitForResponse(
      (response) =>
        new RegExp(`^/api/card/.*${questionId}/query_metadata$`).test(
          new URL(response.url()).pathname,
        ),
      { timeout: 30_000 },
    );
    const queryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new RegExp(`^/api/card/.*\\b${questionId}/query$`).test(
          new URL(response.url()).pathname,
        ),
      { timeout: 30_000 },
    );
    await page.goto(`/question/${questionId}`);
    await metadataResponse;
    await queryResponse;
    await expectColumnContains(page, "name", "destination_one");
    await expectColumnContains(page, "color", "blue");
    await expectColumnNotContains(page, "color", "red");
  });
});
