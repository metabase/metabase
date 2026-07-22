/**
 * Helpers for the impersonated-permission spec (port of
 * e2e/test/scenarios/permissions/impersonated.cy.spec.js).
 *
 * Reused read-only from sibling modules (no shared module is edited):
 * - `createTestRoles`, `QA_DB_SKIP_REASON` → support/view-data-permissions.ts
 * - `updatePermissionsGraph` (the 3-arg form that KEEPS `impersonations`)
 *                                         → support/model-actions.ts
 * - `ALL_USERS_GROUP`                     → support/create-queries.ts
 * - `COLLECTION_GROUP`                    → support/admin-permissions.ts
 * - `saveQuestion`                        → support/sharing.ts
 * - `runNativeQuery`, `openQuestionActions` → support/models.ts
 * - `startNewNativeQuestion`, `typeInNativeEditor` → support/native-editor.ts
 * - `cacheStrategySidesheet`, `selectCacheStrategy` → support/performance-caching.ts
 *
 * === WHY EVERY GROUP ID HERE IS IMPORTED, NEVER TYPED AS A LITERAL ===
 *
 * The upstream spec destructures `{ ALL_USERS_GROUP, COLLECTION_GROUP }` from
 * `USER_GROUPS` (e2e/support/cypress_data.js). Those are:
 *
 *     ALL_USERS_GROUP: 1, ADMIN_GROUP: 2, COLLECTION_GROUP: 5,
 *     DATA_GROUP: 6, READONLY_GROUP: 7, NOSQL_GROUP: 8
 *
 * Note what is NOT in that map: 3 and 4. They live in a SEPARATE
 * `MAGIC_USER_GROUPS` export (`EXTERNAL_USERS_GROUP: 3`,
 * `DATA_ANALYSTS_GROUP: 4`). So the ids are not contiguous, and "the second
 * non-admin group" is 5, not 4.
 *
 * Getting this wrong is not a loud failure. If COLLECTION_GROUP were 4, the
 * graph write would block the (empty) Data Analysts group instead of the
 * `collection` group that the impersonated user actually belongs to, the
 * impersonated user would fall through to an unrestricted grant, and
 * IMPERSONATION WOULD NEVER BE ENFORCED — which reads as "impersonation is
 * broken in the product", not "the test has a wrong constant".
 *
 * Cross-checked three independent ways against this jar:
 *  1. e2e/support/cypress_data.js USER_GROUPS (the upstream source).
 *  2. The LIVE instance's GET /api/permissions/group on this jar:
 *       {id:1,"All Users", magic_group_type:"all-internal-users"}
 *       {id:2,"Administrators"}
 *       {id:4,"Data Analysts", magic_group_type:"data-analyst"}
 *       {id:5,"collection"}       {id:6,"data"}
 *     The impersonated user's `user_group_memberships` is
 *     [ALL_USERS_GROUP, COLLECTION_GROUP] = [1, 5]; group 5 is "collection".
 *
 *     NOTE a drift found while porting: the checked-in
 *     e2e/support/cypress_sample_instance_data.json still calls group 1
 *     "All internal users", while this jar serves "All Users". The IDS agree —
 *     only the label moved — but it means that JSON is not a safe source for
 *     name-based lookups. `assertGroupIds` therefore matches on
 *     `magic_group_type`, which is stable.
 *  3. The already-ported shared constants (create-queries.ts ALL_USERS_GROUP=1,
 *     admin-permissions.ts COLLECTION_GROUP=5), which is what we import.
 *
 * `assertGroupIds` below re-checks (2) at RUN time against the live instance,
 * so a snapshot change cannot silently reintroduce the bug.
 */
import type { MetabaseApi } from "./api";
import { COLLECTION_GROUP } from "./admin-permissions";
import { ALL_USERS_GROUP } from "./create-queries";
import { expect } from "./fixtures";
import { updatePermissionsGraph } from "./model-actions";
import { LOGIN_CACHE, type UserName } from "./sample-data";

export { COLLECTION_GROUP, ALL_USERS_GROUP };

/**
 * The spec's own `const PG_DB_ID = 2`. Under the `postgres-12` snapshot the QA
 * Postgres12 database is added second, after the H2 sample database (id 1).
 * Same convention as support/dashboard-back-navigation.ts and
 * support/permissions-reproductions-js.ts. `assertPgDbId` verifies it against
 * the live instance rather than trusting the literal.
 */
export const PG_DB_ID = 2;

/** The QA Postgres12 database's display name, as the data picker labels it. */
export const PG_DB_NAME = "QA Postgres12";

/**
 * The `impersonated` fixture user (e2e/support/cypress_data.js:158-170):
 *   email: impersonated@metabase.test
 *   login_attributes: { role: "orders_products_access" }
 *   user_group_memberships: [ALL_USERS_GROUP, COLLECTION_GROUP]
 *
 * The `role` attribute is the one the impersonation policy below reads. The
 * matching postgres role is created by `createTestRoles({type:"postgres"})` and
 * is granted SELECT/INSERT/UPDATE/DELETE on **Orders and Products only**
 * (e2e/support/test_roles.js) — hence `reviews` is denied and `orders` is not.
 */
export const IMPERSONATED_USER_EMAIL = "impersonated@metabase.test";
export const IMPERSONATED_ROLE = "orders_products_access";

/**
 * Port of `cy.signInAsImpersonatedUser()` → `cy.signIn("impersonated")`.
 *
 * === WHY THIS IS A CAST AND NOT `signInWithCredentials` ===
 *
 * There is a known hazard in this harness: `signInWithCredentials`
 * (support/sandboxing-via-api.ts) POSTs `/api/session` **through `mb.api`**.
 * The backend's `wrap-session-key` resolves the session **cookie before the
 * `X-Metabase-Session` header**, so if that POST's `Set-Cookie` lands in the
 * API request context's jar, every later `mb.api` call silently runs as that
 * user — and `mb.signInAsAdmin()` does NOT undo it, because it only rebinds
 * the header. That failure mode makes baseline assertions pass while measuring
 * nothing.
 *
 * I checked the mechanism, and it is INAPPLICABLE here, for two independent
 * reasons:
 *
 * 1. `impersonated` IS in the snapshot's login cache. `LOGIN_CACHE` is
 *    `SAMPLE_INSTANCE_DATA.loginCache`, whose keys on this jar are
 *    [admin, normal, nodata, sandboxed, readonly, readonlynosql, nocollection,
 *     nosql, none, impersonated]. `MetabaseHarness.signIn` therefore takes its
 *    CACHED branch, which only calls `context.addCookies` (browser) and sets
 *    the private `sessionId` (header). It never POSTs `/api/session`, so
 *    nothing is ever written into the API jar.
 * 2. Even if it did, the `mb` fixture is constructed with Playwright's
 *    top-level `request` fixture, NOT `context.request` — a separate
 *    APIRequestContext with its own jar. `context.addCookies` cannot reach it.
 *
 * The cast is sound: `signIn`'s cached branch indexes `LOGIN_CACHE`, which is
 * typed `Record<string, ...>`, and returns before ever touching `USERS` (whose
 * `keyof` is the narrow `UserName` that omits `impersonated`). We assert the
 * cache entry exists first so a snapshot change fails loudly here rather than
 * falling through to the `USERS[user]` branch and dereferencing `undefined`.
 *
 * `assertRunsAs` is used at every call site to PROVE which user the API is
 * bound to, rather than trusting this reasoning.
 */
type SignInCapable = { signIn(user: UserName): Promise<void> };

export async function signInAsImpersonatedUser(mb: SignInCapable) {
  expect(
    LOGIN_CACHE.impersonated,
    "the `impersonated` user must have a cached snapshot session; without it " +
      "signIn() falls through to USERS[...] which has no `impersonated` entry",
  ).toBeTruthy();
  await mb.signIn("impersonated" as UserName);
}

/**
 * Proves which user an API client is actually bound to. This is the guard
 * against the silent "every later call ran as the wrong user" failure — a
 * baseline that passes while measuring nothing.
 */
export async function assertRunsAs(
  api: MetabaseApi,
  expectedEmail: string,
  label: string,
) {
  const response = await api.get("/api/user/current");
  const user = (await response.json()) as {
    email: string;
    is_superuser: boolean;
  };
  expect(user.email, `${label}: API is bound to the wrong user`).toBe(
    expectedEmail,
  );
  return user;
}

/**
 * Run-time re-check of the two group ids, resolved BY NAME from the live
 * instance. Guards the "guessed 4 instead of 5" defect described in the module
 * docstring: if the snapshot ever renumbers, this fails loudly instead of
 * quietly disabling impersonation.
 */
export async function assertGroupIds(api: MetabaseApi) {
  const response = await api.get("/api/permissions/group");
  const groups = (await response.json()) as {
    id: number;
    name: string;
    magic_group_type: string | null;
  }[];

  const byName = (name: string) => groups.find((group) => group.name === name);

  // Resolved by `magic_group_type`, NOT by display name: this jar labels the
  // group "All Users" while the checked-in cypress_sample_instance_data.json
  // still says "All internal users" (that fixture file is stale relative to
  // the jar). The ids agree; only the label drifted. `magic_group_type` is the
  // stable identifier, so match on it.
  const allUsers = groups.find(
    (group) => group.magic_group_type === "all-internal-users",
  );
  const collection = byName("collection");

  expect(
    allUsers?.id,
    "ALL_USERS_GROUP must be the id of the all-internal-users magic group",
  ).toBe(ALL_USERS_GROUP);
  expect(
    collection?.id,
    "COLLECTION_GROUP must be the id of the 'collection' group — NOT " +
      "'Data Analysts' (id 4), which lives in MAGIC_USER_GROUPS and has no members",
  ).toBe(COLLECTION_GROUP);

  // And the group the impersonated user actually belongs to is the one we block.
  const dataAnalysts = byName("Data Analysts");
  expect(
    dataAnalysts?.id === COLLECTION_GROUP,
    "sanity: COLLECTION_GROUP must not have collided with Data Analysts",
  ).toBe(false);
}

/** Verifies the spec's `PG_DB_ID = 2` literal against the live instance. */
export async function assertPgDbId(api: MetabaseApi) {
  const response = await api.get(`/api/database/${PG_DB_ID}`);
  const database = (await response.json()) as { name: string; engine: string };
  expect(
    database.name,
    `database ${PG_DB_ID} must be the QA Postgres12 database`,
  ).toBe(PG_DB_NAME);
  expect(database.engine).toBe("postgres");
}

/**
 * Port of the spec-local `setImpersonatedPermission()`.
 *
 * Grants All Users unrestricted+querying on the H2 sample db (1), sets
 * `view-data: impersonated` on the QA Postgres db, blocks BOTH databases for
 * the `collection` group (the impersonated user's other group — without this
 * block, that group's unrestricted grant would supersede the impersonation and
 * the whole spec would silently measure nothing), and installs the
 * impersonation policy keyed on the `role` login attribute.
 */
export async function setImpersonatedPermission(api: MetabaseApi) {
  await updatePermissionsGraph(
    api,
    {
      [ALL_USERS_GROUP]: {
        1: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
        [PG_DB_ID]: {
          "view-data": "impersonated",
          "create-queries": "query-builder-and-native",
        },
      },
      [COLLECTION_GROUP]: {
        1: { "view-data": "blocked" },
        [PG_DB_ID]: { "view-data": "blocked" },
      },
    },
    [
      {
        db_id: PG_DB_ID,
        group_id: ALL_USERS_GROUP,
        attribute: "role",
      },
    ],
  );
}

/**
 * Warm the backend's GraalPy/sqlglot context pool BEFORE the timed part of
 * either test (FINDINGS #222).
 *
 * Both tests run a native query through `runNativeQuery` (support/models.ts),
 * which waits on `POST /api/dataset` with Playwright's default 30s budget. On
 * an impersonation-configured DB, `apply-impersonation`
 * (enterprise .../impersonation/middleware.clj) routes EVERY native query —
 * admins included — through `driver/validate-impersonated-query` ->
 * `sql-tools/is-single-stmt-of-type?` -> GraalPy/sqlglot, SYNCHRONOUSLY inside
 * QP preprocessing. The context pool has `min-size 0`, so the FIRST parse after
 * a backend boots (or after the pool idles to 0) pays a full cold context
 * generation — measured 23.8s cold on an idle M-series Mac vs 3-12ms warm,
 * unbounded inside `.acquire` (graal.clj), i.e. NOT covered by the backend's own
 * 30s Python call timeout. On a loaded runner that first response can consume
 * nearly the whole 30s Playwright budget and time the wait out; it passes on
 * retry once the pool is warm. That is the semi-independent 3/4-and-2/4 flake.
 *
 * This fires one trivial native parse on the impersonated DB, as admin, from the
 * beforeEach — OUTSIDE any waitForDataset window — moving the cold cost off the
 * measured path while leaving the warm path fully observable. `select 1` touches
 * no table, so it succeeds for admin and warms the shared per-JVM pool regardless
 * of role. It MUST run after `setImpersonatedPermission`: `is-single-stmt-of-type?`
 * is only reached when impersonation is configured on the DB, so a native query
 * on any other DB would not exercise (and so would not warm) this path.
 *
 * === Why here and not in worker-backend.ts `warmUp` ===
 * The harness's per-backend warmUp runs a plain MBQL count on the H2 sample DB at
 * boot — that path never reaches `is-single-stmt-of-type?`, so it does not warm
 * this pool, and it runs before the `postgres-12` snapshot / impersonation config
 * that the sqlglot path requires even exist. Warming from boot would (1) need to
 * synthesise an impersonation-configured native query for a concern only these two
 * tests have, (2) add the ~24s cold cost to every spec's boot, and (3) be unreliable
 * anyway — `min-size 0` lets the pool idle back to cold before the test runs. A
 * beforeEach warm, immediately before each test and exercising the exact path, is
 * both more targeted and more reliable.
 *
 * A generous request timeout is passed because the cold parse itself can exceed the
 * 30s APIRequestContext default on a loaded runner — the very cost being moved here.
 */
export async function warmSqlParsingPool(api: MetabaseApi) {
  await api.post(
    "/api/dataset",
    {
      database: PG_DB_ID,
      type: "native",
      native: { query: "select 1" },
    },
    { timeout: 120_000 },
  );
}

/**
 * Reads back the impersonation policy the graph write installed. Used as the
 * "the restriction is actually in place" precondition — the counterpart to the
 * remove-the-restriction mutation.
 */
export async function getImpersonations(
  api: MetabaseApi,
): Promise<{ db_id: number; group_id: number; attribute: string }[]> {
  const response = await api.get("/api/ee/advanced-permissions/impersonation");
  return (await response.json()) as {
    db_id: number;
    group_id: number;
    attribute: string;
  }[];
}
