/**
 * Playwright port of
 * e2e/test/scenarios/onboarding/home/browse-slash-schema.cy.spec.ts
 *
 * issue 77353: a warehouse schema whose name contains a slash must be
 * browsable and queryable — the slash is URL-encoded in the browse route and
 * the data picker.
 *
 * Port notes
 * ----------
 * - **QA-DATABASE TIER (@external).** Restores the `postgres-writable`
 *   snapshot and drives the writable QA Postgres container, so it is gated on
 *   `PW_QA_DB_ENABLED` (the deliberate gate — bare `QA_DB_ENABLED` leaks
 *   truthy from cypress.env.json).
 * - `H.queryWritableDB(SQL, "postgres")` → `queryWritableDB(SQL)`
 *   (support/schema-viewer.ts talks to the writable container over `pg`).
 * - `H.resyncDatabase({ dbId, tables })` → `resyncDatabase(mb.api, { … })`;
 *   the explicit `tables` list is load-bearing (the bare form returns as soon
 *   as the DB has any synced table and would not wait for the two just
 *   created — PORTING's 🔴 note).
 * - Cypress's `after()` (once, after the file) → `test.afterAll`;
 *   `queryWritableDB` is a standalone helper needing no `mb`. The cleanup is
 *   also the head of `SETUP_SQL`, so it is idempotent tidy-up.
 * - `cy.findByRole("heading", { name })` with a string is an EXACT match
 *   (rule 1) → `getByRole("heading", { name, exact: true })`.
 * - `cy.location("pathname").should("eq", …)` is a Cypress-retried assertion →
 *   `expect.poll` on the pathname (one-shot checks catch transient states).
 * - `H.newButton("Question")` clicks the app-bar "New" then the popover's
 *   "Question" item → `newButton(page).click()` + the popover item.
 */
import { newButton, popover } from "../support/ui";
import {
  assertQueryBuilderRowCount,
  miniPicker,
  visualize,
} from "../support/notebook";
import {
  WRITABLE_DB_ID,
  queryWritableDB,
  resyncDatabase,
} from "../support/schema-viewer";
import { expect, test } from "../support/fixtures";

const DB_NAME = "Writable Postgres12";
const SLASH_SCHEMA = "public/transactions";
const TABLE_NAME = "slash_schema_orders";
const TABLE_DISPLAY_NAME = "Slash Schema Orders";
const ANCHOR_TABLE_NAME = "plain_schema_anchor";

const CLEANUP_SQL = `
  DROP SCHEMA IF EXISTS "${SLASH_SCHEMA}" CASCADE;
  DROP TABLE IF EXISTS public.${ANCHOR_TABLE_NAME};
`;

const SETUP_SQL = `
  ${CLEANUP_SQL}
  CREATE SCHEMA "${SLASH_SCHEMA}";
  CREATE TABLE "${SLASH_SCHEMA}".${TABLE_NAME} (
    id SERIAL PRIMARY KEY,
    total INTEGER
  );
  INSERT INTO "${SLASH_SCHEMA}".${TABLE_NAME} (total) VALUES (10), (20);
  CREATE TABLE public.${ANCHOR_TABLE_NAME} (id SERIAL PRIMARY KEY);
`;

const QA_DB_SKIP_REASON =
  "Requires the writable QA Postgres container and its postgres-writable snapshot (set PW_QA_DB_ENABLED)";

test.describe("issue 77353 (schema names containing a slash)", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await queryWritableDB(SETUP_SQL);
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [TABLE_NAME, ANCHOR_TABLE_NAME],
    });
  });

  test.afterAll(async () => {
    await queryWritableDB(CLEANUP_SQL);
  });

  test("should browse and query tables in a schema whose name contains a slash (metabase#77353)", async ({
    page,
  }) => {
    // browse to the schema from the database page
    await page.goto(`/browse/databases/${WRITABLE_DB_ID}`);
    await page
      .getByRole("heading", { name: SLASH_SCHEMA, exact: true })
      .click();

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(
        `/browse/databases/${WRITABLE_DB_ID}/schema/${encodeURIComponent(SLASH_SCHEMA)}`,
      );
    await expect(
      page.getByRole("heading", { name: TABLE_DISPLAY_NAME, exact: true }),
    ).toBeVisible();

    // pick a table from the slashed schema in the data picker
    await newButton(page).click();
    await popover(page).getByText("Question", { exact: true }).click();

    await miniPicker(page).getByText(DB_NAME, { exact: true }).click();
    await miniPicker(page).getByText(SLASH_SCHEMA, { exact: true }).click();
    await miniPicker(page)
      .getByText(TABLE_DISPLAY_NAME, { exact: true })
      .click();

    await visualize(page);
    await assertQueryBuilderRowCount(page, 2);
  });
});
