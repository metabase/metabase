/**
 * Port of
 * e2e/test/scenarios/permissions/sandboxing/sandboxing-misconfiguration.cy.spec.ts
 * (+ the parts of helpers/e2e-sandboxing-helpers.ts it uses).
 *
 * Gates
 * -----
 * - QA DB: the `before` hook restores the `postgres-writable` snapshot and
 *   talks to the writable QA postgres directly → `PW_QA_DB_ENABLED`. Unlike
 *   most QA-DB ports this one is not merely incidental: the entire test is
 *   about DDL on a warehouse table, so there is nothing left without it.
 * - Token: `H.activateToken("pro-self-hosted")`, load-bearing at TWO
 *   independent points. Measured, not assumed — the token-OFF arm dies
 *   EARLIER than the source trace alone would predict:
 *     1. `advanced_permissions` — `blockUserGroupPermissions` in the setup
 *        does `PUT /api/permissions/graph` with `view-data: "blocked"`, which
 *        answers 402 "the blocked permissions functionality is only enabled
 *        if you have a premium token with the advanced-permissions feature".
 *        This is where the token-OFF arm actually dies.
 *     2. `sandboxes` — with the setup's permission step skipped so the arm
 *        can reach the policy UI, the "Row and column security" option is
 *        simply absent from the permissions dropdown. That is the FE half of
 *        the gate; the BE half is `upsert-sandboxes!`, which is
 *        `(defenterprise … :feature :sandboxes)` with an OSS implementation
 *        that throws, plus the QP sandboxing middleware's own
 *        `(premium-features/assert-has-feature :sandboxes)`. FE and BE agree.
 *   Both features are enabled on this token (42 of 59 keys enabled).
 *
 * Setup model
 * -----------
 * Upstream's Mocha `before` builds the fixture once and takes
 * `H.snapshot("sandboxing-misconfiguration-snapshot")`; `beforeEach` restores
 * it. `mb` is a test-scoped Playwright fixture and cannot be used from
 * `beforeAll`, so — as in tests/sandboxing-via-ui.spec.ts — the once-only
 * build lives behind a worker-lifetime `built` flag inside `beforeEach`.
 *
 * 🔴 PORTING DEVIATION (deliberate, and it fixes a latent upstream hole):
 * the physical `products` table lives in the writable postgres, which is NOT
 * part of the app-DB snapshot. The test's final act is
 * `ALTER TABLE products DROP COLUMN category`, so restoring the snapshot does
 * NOT undo it — a second execution of this file's body (upstream: a retry;
 * here: `--repeat-each`) would run against a table with no `category` column.
 * `setUpProductsTable()` is therefore re-run after every restore. It rebuilds
 * the identical schema, so the field rows carried in the restored snapshot
 * still resolve by name and no extra resync is needed.
 * (Observed, so as not to overclaim: under `--repeat-each=3` on this harness
 * each repeat landed on a FRESH worker, so `built` was false every time and
 * the `built === true` path was not what those three greens exercised. The
 * rebuild is still required for any reused worker, and is cheap.)
 *
 * Auth
 * ----
 * See the header of support/sandboxing-via-ui.ts and of
 * support/sandboxing-misconfiguration.ts. `signInAs` returns an API client
 * for the signed-in user and leaves `mb.api` as admin; `assertRunningAs`
 * (added by the port, not upstream) proves which user each side actually
 * resolved to. That is a deliberate strengthening on a security surface: the
 * Playwright harness gives no equivalent of Cypress's single cookie jar, and
 * the failure mode — admin quietly executing the "sandboxed" queries — is
 * silent and green.
 */
import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import {
  WRITABLE_DB_ID,
  assertResponseFailsClosed,
  assertRunningAs,
  assertUserGroupIds,
  assignAttributeToUser,
  configureSandboxPolicyOnColumn,
  createQuestion,
  createUserFromRawData,
  dropCategoryColumn,
  getCardResponses,
  getProductsTableId,
  gizmoViewer,
  preparePermissions,
  resyncProductsTable,
  rowsShouldContainOnlyOneCategory,
  setUpProductsTable,
  signInAs,
} from "../support/sandboxing-misconfiguration";

const QA_DB_ENABLED = Boolean(process.env.PW_QA_DB_ENABLED);
const HAS_TOKEN = Boolean(resolveToken("pro-self-hosted"));

/** Worker-lifetime: upstream's `before` runs once per file. */
let built = false;

test.describe("admin > permissions > sandboxing > misconfiguration", () => {
  // Gates are declared AHEAD of any activateToken call.
  test.skip(
    !QA_DB_ENABLED,
    "Requires the writable QA postgres database + its postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );
  test.skip(
    !HAS_TOKEN,
    "Row and column security needs the `sandboxes` feature — set MB_PRO_SELF_HOSTED_TOKEN",
  );

  test.beforeEach(async ({ mb }) => {
    test.setTimeout(600_000);

    if (!built) {
      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      // Re-check the mirrored USER_GROUPS ids against the live instance: a
      // drifted id would block the wrong group and leave the writable
      // database readable, which this file's assertions would not notice.
      await assertUserGroupIds(mb.api);
      await preparePermissions(mb.api);

      await createUserFromRawData(mb.api, gizmoViewer);

      // "Create a simple editable products table"
      await setUpProductsTable();
      await resyncProductsTable(mb.api);

      await mb.api.snapshot("sandboxing-misconfiguration-snapshot");
      built = true;
    }

    await mb.restore("sandboxing-misconfiguration-snapshot");
    // Cypress keeps the admin cookie across restore (the session lives in the
    // snapshot); the Playwright `mb` fixture starts each test signed out.
    await mb.signInAsAdmin();

    // See the PORTING DEVIATION note in the file header.
    await setUpProductsTable();
  });

  test("if we create a sandboxing policy on a column but then the column is deleted, the sandboxing system fails closed", async ({
    mb,
    context,
    page,
  }) => {
    await assignAttributeToUser(mb.api, {
      user: gizmoViewer,
      attributeValue: "Gizmo",
    });
    // Upstream: configureSandboxPolicy({ filterTableBy: "column",
    // filterColumn: "Category" }, { tableName: "Products", databaseId:
    // WRITABLE_DB_ID }). See the helper's docstring for why this port has its
    // own column-branch copy (shared-warehouse schema debris).
    await configureSandboxPolicyOnColumn(
      page,
      { filterColumn: "Category" },
      {
        tableName: "Products",
        databaseId: WRITABLE_DB_ID,
      },
    );

    const questionData = {
      name: "Simple question based on the 'Products' table",
      model: "card",
    };

    const tableId = await getProductsTableId(mb.api);
    const { id: questionId } = await createQuestion(mb.api, {
      database: WRITABLE_DB_ID,
      name: questionData.name,
      query: {
        "source-table": tableId,
        limit: 20,
      },
    });

    // The session POST runs through a throwaway request context, so `mb.api`
    // is untouched and stays admin. Both halves are pinned below.
    const api = await signInAs(context, mb.baseUrl, gizmoViewer, mb.api);
    await assertRunningAs(api, gizmoViewer.email);
    await assertRunningAs(mb.api, "admin@metabase.test");

    const questions = [{ ...questionData, id: questionId }];

    rowsShouldContainOnlyOneCategory({
      responses: await getCardResponses(api, questions),
      questions,
      productCategory: "Gizmo",
    });

    await dropCategoryColumn();

    // "After the column is dropped, the sandboxing system should fail closed"
    const responses = await getCardResponses(api, questions);
    // Positive anchor for the zero-rows assertion inside
    // assertResponseFailsClosed: one response per question, so an empty
    // `responses` array cannot make the loop below vacuously pass.
    expect(responses, "one response per question").toHaveLength(
      questions.length,
    );
    for (const response of responses) {
      assertResponseFailsClosed(response);
    }
  });
});
