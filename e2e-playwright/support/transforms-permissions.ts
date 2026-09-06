/**
 * Helpers for the transforms-permissions port
 * (e2e/test/scenarios/permissions/transforms-permissions.cy.spec.ts).
 *
 * Module name matches the source spec basename (support/transforms-permissions.ts
 * ↔ tests/transforms-permissions.spec.ts), so there is no dangling-import risk.
 *
 * Everything that already had a home is imported READ-ONLY from the existing
 * support modules and re-exported here so the spec has a single import surface:
 *
 * - row/cell locators .............. support/create-queries.ts
 * - modifyPermission ............... support/admin-permissions.ts
 * - assertPermissionForItem ........ support/download-permissions.ts
 * - isPermissionDisabled ........... support/downgrade-ee-to-oss.ts
 * - updatePermissionsGraph ......... support/model-actions.ts
 * - setUserAsAnalyst ............... support/datamodel-data-studio.ts
 * - transform creation ............. support/transforms-inspect.ts
 * - DataStudio locators ............ support/transforms.ts
 *
 * Only the things with no shared home live below.
 *
 * ============================ FIXTURE IDS ============================
 * The brief's hard rule: never guess a fixture id. Every id used by this port
 * is derived AT IMPORT TIME from e2e/support/cypress_sample_instance_data.json
 * (the same file the Cypress fixtures are generated into) and cross-checked
 * against the name, so a snapshot change breaks loudly instead of silently
 * pointing at the wrong group.
 *
 * Measured from the fixture on this box:
 *   groups: 1 "All internal users", 2 "Administrators", 3 "All tenant users",
 *           4 "Data Analysts", 5 "collection", 6 "data", 7 "readonly",
 *           8 "nosql"
 *   users:  1 admin@, 2 normal@, 3 nodata@, ...
 *
 * Note group **4 is Data Analysts** — it is `MAGIC_USER_GROUPS`, NOT
 * `USER_GROUPS`, and mistaking 4/5 for COLLECTION/DATA is the exact error that
 * silently disabled an impersonation test. COLLECTION_GROUP is 5, DATA_GROUP
 * is 6, and both are asserted by name below.
 * =====================================================================
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { updatePermissionsGraph } from "./model-actions";
import { WRITABLE_DB_ID, queryWritableDB } from "./schema-viewer";
import { DataStudio } from "./transforms";

export { updatePermissionsGraph };
export { modifyPermission } from "./admin-permissions";
export { assertPermissionForItem } from "./download-permissions";
export { isPermissionDisabled } from "./downgrade-ee-to-oss";
export { setUserAsAnalyst } from "./datamodel-data-studio";
export { permissionTable } from "./create-queries";
export {
  createMbqlTransform,
  createAndRunMbqlTransform,
} from "./transforms-inspect";
export { WRITABLE_DB_ID };
export { getTableId, resyncDatabase } from "./schema-viewer";
export { resetManySchemasTable } from "./transforms-codegen";
export { DataStudio };

// ---------------------------------------------------------------------------
// Fixture ids, read from the fixture (never guessed)
// ---------------------------------------------------------------------------

function groupIdByName(name: string): number {
  const group = (SAMPLE_INSTANCE_DATA.groups as { id: number; name: string }[]).find(
    (group) => group.name === name,
  );
  if (!group) {
    throw new Error(
      `Group "${name}" not found in cypress_sample_instance_data — the snapshot moved`,
    );
  }
  return Number(group.id);
}

function userIdByEmail(email: string): number {
  const user = (SAMPLE_INSTANCE_DATA.users as { id: number; email: string }[]).find(
    (user) => user.email === email,
  );
  if (!user) {
    throw new Error(
      `User "${email}" not found in cypress_sample_instance_data — the snapshot moved`,
    );
  }
  return Number(user.id);
}

/** USER_GROUPS.ALL_USERS_GROUP — "All internal users". Measured: 1. */
export const ALL_USERS_GROUP = groupIdByName("All internal users");
/** USER_GROUPS.COLLECTION_GROUP — the group literally named "collection". Measured: 5. */
export const COLLECTION_GROUP = groupIdByName("collection");
/** USER_GROUPS.DATA_GROUP — the group literally named "data". Measured: 6. */
export const DATA_GROUP = groupIdByName("data");
/** NORMAL_USER_ID (cypress_sample_instance_data.js). Measured: 2. */
export const NORMAL_USER_ID = userIdByEmail("normal@metabase.test");

/** SAMPLE_DB_ID (e2e/support/cypress_data.js) — the fixed sample-database id. */
export { SAMPLE_DB_ID } from "./sample-data";

// ---------------------------------------------------------------------------
// Spec constants (verbatim from the spec header)
// ---------------------------------------------------------------------------

export const CREATE_QUERIES_PERMISSION_INDEX = 1;
export const TRANSFORMS_PERMISSION_INDEX = 5;

export const SOURCE_TABLE = "Animals";
export const TARGET_TABLE = "permission_test_table";
export const TARGET_SCHEMA = "Schema A";
export const DB_NAME = "Writable Postgres12";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

/**
 * Port of `DataPermissionValue` (frontend/src/metabase-types/api/permissions.ts).
 * Transcribed rather than imported: the enum lives behind the frontend's
 * webpack aliases, which this package does not resolve. Values verified
 * against the enum at permissions.ts:22-44.
 */
export const DataPermissionValue = {
  UNRESTRICTED: "unrestricted",
  QUERY_BUILDER_AND_NATIVE: "query-builder-and-native",
  YES: "yes",
  NO: "no",
} as const;

// ---------------------------------------------------------------------------
// Permission-graph helpers (spec-local functions, verbatim)
// ---------------------------------------------------------------------------

function transformsGraphForAllGroups(value: "yes" | "no") {
  const entry = {
    [WRITABLE_DB_ID]: {
      "view-data": DataPermissionValue.UNRESTRICTED,
      "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      transforms: value,
    },
  };
  return {
    [ALL_USERS_GROUP]: entry,
    [COLLECTION_GROUP]: entry,
    [DATA_GROUP]: entry,
  };
}

/** Port of the spec-local grantTransformsPermissionToAllGroups. */
export function grantTransformsPermissionToAllGroups(api: MetabaseApi) {
  return updatePermissionsGraph(api, transformsGraphForAllGroups("yes"));
}

/** Port of the spec-local denyTransformsPermissionToAllGroups. */
export function denyTransformsPermissionToAllGroups(api: MetabaseApi) {
  return updatePermissionsGraph(api, transformsGraphForAllGroups("no"));
}

/** Port of the spec-local getTransformsNavLink. */
export const getTransformsNavLink = (page: Page) =>
  DataStudio.nav(page).getByRole("link", { name: "Transforms", exact: true });

// ---------------------------------------------------------------------------
// Warehouse cleanup (no counterpart upstream — see rationale)
// ---------------------------------------------------------------------------

/**
 * Drop the physical tables this spec's transforms write into.
 *
 * No counterpart in the Cypress original, and it changes no assertion. The
 * "already exists" guard on `POST /api/transform`
 * (transforms_rest/api/transform.clj:183 → `target-table-exists?` →
 * `driver/table-exists?`) is a check against the REAL warehouse, which the
 * app-DB snapshot restore in the beforeEach cannot touch. Upstream tolerates
 * this because CI provisions the writable postgres container fresh per job;
 * the local container is long-lived and shared across slots and sessions.
 *
 * Deliberately narrow — only the two table names this spec writes, only in
 * "Schema A" — so it cannot disturb the sibling QA-DB specs that share the
 * container (FINDINGS #85: do not drop foreign schemas, siblings live there).
 *
 * Note this file's spec also re-creates the same target table across several
 * tests within one run, so this runs in the beforeEach, not just once.
 */
export async function resetPermissionTestTables() {
  await queryWritableDB(`
    DROP TABLE IF EXISTS "Schema A"."permission_test_table" CASCADE;
    DROP TABLE IF EXISTS "Schema A"."unauthorized_table" CASCADE;
  `);
}
