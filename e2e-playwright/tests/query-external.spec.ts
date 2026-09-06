/**
 * Playwright port of
 * e2e/test/scenarios/question/query-external.cy.spec.js
 *
 * Collision checks (done before writing):
 * - `grep -rl "query-external" tests/ support/` → no hits. No prior port of
 *   this source exists.
 * - `ls tests/` → no `query-external.spec.ts`.
 * - `ls e2e/test/scenarios/question/` → `query-external.cy.spec.js` is the
 *   only file of that basename anywhere under e2e/.
 * - Support module is `support/query-external.ts` — matches the target
 *   basename, NO deviation.
 *
 * Infra tier — determined by READING the `beforeEach`, not the `@external`
 * tag. The source builds two identical describes from a `supportedDatabases`
 * table; each restores a different snapshot:
 *   - Mongo → snapshot `mongo-5`   (container metabase-e2e-mongo-sample, :27004)
 *   - MySQL → snapshot `mysql-8`   (container metabase-e2e-mysql-sample, :3304)
 * Both are genuinely container-backed. Gated on PW_QA_DB_ENABLED, at DESCRIBE
 * level (the describes have no `afterEach`, so `beforeEach` would also have
 * been safe — checked, not assumed; describe level is used because it is
 * unconditionally correct and matches the sibling ports).
 *
 * ⚠️ WRITABLE_DB_ID is a MISNOMER here. The source imports the constant
 * `WRITABLE_DB_ID` (literally `2`) from e2e/support/cypress_data, but neither
 * snapshot it restores contains a writable database:
 *   - `mongo-5` is `restore("default")` + `addMongoDatabase()` → db 2 is
 *     "QA Mongo", the READ-ONLY mongo-sample container.
 *   - `mysql-8` is `restore("default")` + `addMySQLDatabase({})` → db 2 is
 *     "QA MySQL8", the READ-ONLY mysql-sample container (`sample` schema).
 * The writable variants are the SEPARATE `postgres-writable` / `mysql-writable`
 * snapshots (see e2e/snapshot-creators/qa-db.cy.snap.js), which this spec never
 * restores. Verified at runtime on `name` and `details.dbname`, not on the
 * constant — see the findings note. The port therefore names it `QA_DB_ID` and
 * writes nothing to either warehouse: this spec is READ-ONLY, so it cannot
 * contribute debris to the shared containers.
 *
 * Port notes:
 * - `cy.intercept("POST", "/api/dataset").as("dataset")` in the `beforeEach`
 *   is DEAD: the spec never `cy.wait("@dataset")`s, and `H.visualize()`
 *   (e2e/support/helpers/e2e-notebook-helpers.ts:53) re-registers the very same
 *   alias and waits on its own. Dropped; the shared `visualize()` port carries
 *   the equivalent `waitForResponse` and registers it BEFORE the click.
 * - `cy.request("/api/database/2/schema/").as("schema")` is a plain value
 *   alias, not a network queue — it is issued in `beforeEach` and dereferenced
 *   in the test body purely for readability. The port issues it at the point of
 *   use via `getTableIdByName`; there is no interception ordering to preserve.
 * - `H.openTable({ database, table, mode: "notebook" })`: the SHARED
 *   `openTable` port (support/ad-hoc-question.ts) routes notebook mode through
 *   `joins.openTableNotebook`, which HARDCODES SAMPLE_DB_ID and drops the
 *   `database` argument — so calling it here would silently build the ad-hoc
 *   query against the Sample Database with a foreign table id. That is a real
 *   defect in a shared module (upstream `openTable` honours `database` in both
 *   modes); shared modules are off-limits to porting agents, so this port
 *   reuses the existing read-only workaround `openTableNotebookInDb`
 *   (support/question-notebook.ts), written for exactly this situation.
 *   FIXME(shared): consolidate ad-hoc-question.openTable's notebook path to
 *   thread `database` through, then retire openTableNotebookInDb /
 *   openTableNotebookInDatabase (question-reproductions-1.ts).
 * - `openTableNotebookInDb` adds a readiness gate (the data step's
 *   `data-step-cell` is visible) that upstream `visitQuestionAdhoc` does NOT
 *   have — upstream returns `cy.wrap(null)` on the notebook path and relies on
 *   Cypress retrying the subsequent `cy.button("Visualize")`. This is a
 *   STRENGTHENING, stated explicitly; it is also load-bearing, because
 *   Playwright's Visualize click would otherwise be able to land on a notebook
 *   whose data step has not yet resolved the foreign table's metadata.
 * - `cy.contains("37.65")` is a case-sensitive SUBSTRING match resolving to the
 *   INNERMOST descendant, asserting existence only → `getByText(/…/).first()`
 *   + `toBeAttached()`. NOT `toBeVisible` (Cypress `.contains()` does not imply
 *   visibility) and NOT `{ exact: true }` (it is a substring match; the cell's
 *   full textContent is "37.65" but the assertion upstream does not require
 *   that, and pinning it would be a strengthening for no gain).
 *
 * Absence assertions: NONE. This spec contains exactly one assertion and it is
 * a positive-presence one, so the "zero-assertion satisfied on its first poll"
 * hazard is INAPPLICABLE here — there is no absence assertion needing a
 * positive anchor. The presence assertion is itself the anchor proving the
 * container rendered: 37.65 is a value from the QA warehouse's ORDERS table,
 * unreachable unless the external database actually answered.
 */
import { visualize } from "../support/notebook";
import { expect, test } from "../support/fixtures";
import { openTableNotebookInDb } from "../support/question-notebook";
import {
  QA_DB_SKIP_REASON,
  getTableIdByName,
} from "../support/query-external";

/**
 * The source's `WRITABLE_DB_ID` import. Under BOTH snapshots this spec
 * restores, database 2 is the read-only QA warehouse, not a writable one —
 * see the header. Renamed to say what it actually is.
 */
const QA_DB_ID = 2;

const supportedDatabases = [
  {
    database: "Mongo",
    snapshotName: "mongo-5",
    // `dbName` is declared in the source's table but never read by the test.
    // Kept, and used below as an out-of-band identity check on database 2 that
    // the source does not perform.
    dbName: "QA Mongo",
  },
  {
    database: "MySQL",
    snapshotName: "mysql-8",
    dbName: "QA MySQL8",
  },
];

for (const { database, snapshotName, dbName } of supportedDatabases) {
  test.describe("scenarios > question > query > external", () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    test.beforeEach(async ({ mb }) => {
      await mb.restore(snapshotName);
      await mb.signInAsAdmin();
    });

    test(`can query ${database} database`, async ({ page, mb }) => {
      // Not in the source: assert that database 2 under this snapshot really
      // is the QA warehouse named in the table, so a snapshot change can never
      // silently turn this into a Sample-Database test. Stated as a
      // strengthening.
      const db = await (await mb.api.get(`/api/database/${QA_DB_ID}`)).json();
      expect(db.name).toBe(dbName);

      const tableId = await getTableIdByName(mb.api, QA_DB_ID, "orders");

      await openTableNotebookInDb(page, {
        database: QA_DB_ID,
        table: tableId,
      });

      await visualize(page);

      await expect(page.getByText(/37\.65/).first()).toBeAttached();
    });
  });
}
