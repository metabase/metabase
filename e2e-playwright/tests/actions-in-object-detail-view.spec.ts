/**
 * Playwright port of
 * e2e/test/scenarios/actions/actions-in-object-detail-view.cy.spec.js
 *
 * ── Collision checks (done BEFORE writing anything) ─────────────────────────
 * - `grep -rl "actions-in-object-detail-view" tests/ support/` → NO hits. No
 *   existing port names this source.
 * - `ls tests/` → no `actions-in-object-detail-view.spec.ts`. The three landed
 *   actions-tier neighbours — `model-actions.spec.ts`,
 *   `actions-on-dashboards.spec.ts`, `actions-reproductions.spec.ts` — are
 *   ports of DIFFERENT sources; all three were read before writing this.
 * - `ls e2e/test/scenarios/actions/` → four `.cy.spec.js` files, no `.ts`
 *   sibling of this basename.
 *   PORTED FILE: `e2e/test/scenarios/actions/actions-in-object-detail-view.cy.spec.js`
 * - Support module is `support/actions-in-object-detail-view.ts` — matches the
 *   target basename, NO deviation.
 *
 * ── Infra tier: read from the spec, not from the tags ───────────────────────
 * The single top-level describe is tagged `["@external", "@actions"]` and the
 * tag is CORRECT and load-bearing here (unlike the other three actions specs,
 * where tags were wrong in one direction or another):
 *
 *   beforeEach restores the `postgres-writable` snapshot, then
 *   `resetTestTable({type:"postgres", table:"scoreboard_actions"})` DROPs and
 *   rebuilds `public.scoreboard_actions` in the writable QA container, grants
 *   All Users unrestricted view-data + query-builder-and-native on
 *   WRITABLE_DB_ID, resyncs that database, and builds a model over the table.
 *
 * `WRITABLE_DB_ID` is the literal `2`. VERIFIED on this box, against slot 5's
 * backend, that under the `postgres-writable` snapshot database 2 is
 * `name: "Writable Postgres12"`, `engine: postgres`,
 * `details.dbname: "writable_db"`, `details.port: 5404` — i.e. genuinely the
 * writable container, not the read-only QA sample that id 2 points at under
 * `postgres-12`. Every test here writes to it (UPDATE + DELETE through
 * implicit model actions), so the whole file is gated on PW_QA_DB_ENABLED.
 * There is no subset that can run without the container.
 *
 * ── Shared-DB state created, and how it is restored ────────────────────────
 * `resetTestTable` drops + recreates `public.scoreboard_actions` on every
 * beforeEach — the same table model-actions / actions-on-dashboards /
 * actions-reproductions rebuild, so this spec restores its own state on entry
 * rather than on exit, exactly like upstream. Row 12 is UPDATEd and then
 * DELETEd by the "in modal" tests; the next beforeEach wipes that. No other
 * table, schema, or database is touched (PORTING #85 — sibling slots are live).
 *
 * ── Port notes ─────────────────────────────────────────────────────────────
 * - `asAdmin(cb)` / `asNormalUser(cb)` (signIn → body → signOut) are ported as
 *   plain `mb.signIn(...)` / `mb.signOut()` bracketing, since the harness API
 *   client follows the signed-in user the same way `cy.request` does.
 * - cy.intercept(...).as() + cy.wait("@x") → a response QUEUE
 *   (`recordAlias`/`waitForAlias`, support/actions-in-object-detail-view.ts),
 *   NOT `page.waitForResponse`. This spec waits on `@prefetchValues` three
 *   times while the execute-modal form fires a fourth, un-awaited prefetch
 *   after a successful submit; Cypress's queue pops past responses and
 *   waitForResponse cannot. `@getModelActions` is never awaited upstream →
 *   dropped (rule 2).
 * - findByText / findByLabelText / cy.button with string args are EXACT in
 *   testing-library → `{ exact: true }` everywhere (rule 1).
 * - `{ viewportHeight: 1200 }` on the "in modal" describe → an explicit
 *   `page.setViewportSize({ width: 1280, height: 1200 })` (1280 is the Cypress
 *   default width, e2e/support/config.js:302). Its sibling option
 *   `requestTimeout: 10000` has no Playwright equivalent and is dropped — the
 *   harness already runs with PW_ACTION_TIMEOUT.
 * - `H.createModelFromTableName` is re-implemented in the spec's own support
 *   module with the table lookup PINNED to schema `public`; the copy in
 *   support/actions-on-dashboards.ts leaves the schema unpinned, which is only
 *   safe while nothing else in the shared container shares the table name.
 * - `H.resyncDatabase({ dbId, tableName: X })` ≡ `{ tables: [X] }` (upstream's
 *   waitForSyncToFinish treats the two identically). The stale
 *   `initial_sync_status: "complete"` hole DOES apply here — `resetTestTable`
 *   drops and recreates the table under an existing synced database — so the
 *   table name is passed explicitly rather than using the bare form, which is
 *   what upstream does too.
 * - `cy.realPress("Escape")` → `page.keyboard.press("Escape")`.
 * - `cy.findByLabelText("Score").clear().type(987654321)` → `fill("987654321")`
 *   (cy.type accepts numbers; the DOM value is a string either way).
 *
 * ── Faithfulness notes on upstream assertions kept verbatim ────────────────
 * - `assertInputValue` uses `value || ""`, so a literal score of 0 would be
 *   asserted as an EMPTY input. Ported verbatim; rows 11/12 have scores 70/80
 *   so the branch is unreachable in this spec. Analysis inline in the support
 *   module rather than a silent "fix".
 * - The dashboard test's `cy.findByTestId("dashcard").within(...)` implies the
 *   dashcard EXISTS (Cypress findBy throws when it doesn't). The port asserts
 *   that explicitly before the not-exists check, so the anti-assertion cannot
 *   pass vacuously against an unrendered dashcard. That is a transcription of
 *   Cypress semantics, not a strengthening.
 */
import { expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";

import { resetTestTable } from "../support/actions-on-dashboards";
import {
  actionExecuteModal,
  actionForm,
  assertActionsDropdownExists,
  assertActionsDropdownNotExists,
  assertScoreFormPrefilled,
  assertToast,
  closeObjectDetailModal,
  createModelFromTableName,
  deleteObjectModal,
  isExecuteAction,
  isPrefetchValues,
  objectDetailModal,
  openDeleteObjectModal,
  openUpdateObjectModal,
  recordAlias,
  tableInteractive,
  waitForAlias,
} from "../support/actions-in-object-detail-view";
import { createQuestionAndDashboard } from "../support/factories";
import {
  USER_GROUPS,
  createImplicitActions,
  updatePermissionsGraph,
} from "../support/model-actions";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { main, visitDashboard } from "../support/ui";

const WRITABLE_TEST_TABLE = "scoreboard_actions";
const FIRST_SCORE_ROW_ID = 11;
const SECOND_SCORE_ROW_ID = 12;
const UPDATED_SCORE = 987654321;
const UPDATED_SCORE_FORMATTED = "987,654,321";

const { ALL_USERS_GROUP } = USER_GROUPS;

const DASHBOARD = {
  name: "Test dashboard",
  database: WRITABLE_DB_ID,
};

type ScoreRow = {
  id: unknown;
  team_name: unknown;
  score: unknown;
  status: unknown;
  created_at: unknown;
  updated_at: unknown;
};

test.describe("scenarios > actions > actions-in-object-detail-view", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA Postgres database (writable_db on :5404) and the postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

  let modelId: number;

  test.beforeEach(async ({ page, mb }) => {
    // Installed before anything can fire — the queue must not miss a response.
    recordAlias(page, "executeAction", isExecuteAction);
    recordAlias(page, "prefetchValues", isPrefetchValues);

    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: WRITABLE_TEST_TABLE });

    await mb.signInAsAdmin();
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [WRITABLE_TEST_TABLE],
    });
    modelId = await createModelFromTableName(mb.api, {
      tableName: WRITABLE_TEST_TABLE,
    });
    await mb.signOut();
  });

  /** Port of the spec-local visitObjectDetail. */
  async function visitObjectDetail(
    page: Page,
    id: number,
    objectId: number,
  ) {
    // H.visitModel(modelId): visit + wait for POST /api/dataset.
    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page.goto(`/model/${id}`);
    await dataset;

    await expect(main(page).getByText("Loading...", { exact: true })).toHaveCount(
      0,
    );
    await openObjectDetailModal(page, objectId);
  }

  /** Port of the spec-local openObjectDetailModal. */
  async function openObjectDetailModal(
    page: Page,
    objectId: number,
  ) {
    await tableInteractive(page)
      .getByText(String(objectId), { exact: true })
      .click();
  }

  test.describe("in dashboard", () => {
    let dashboardId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
      await createImplicitActions(mb.api, { modelId });

      const { dashboardId: id } = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Score detail",
          display: "object",
          database: WRITABLE_DB_ID,
          query: {
            "source-table": `card__${modelId}`,
          },
        },
        dashboardDetails: DASHBOARD,
      });
      dashboardId = id;
      await mb.signOut();
    });

    test("does not show model actions in model visualization on a dashboard", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();

      await visitDashboard(page, mb.api, dashboardId);

      const dashcard = page.getByTestId("dashcard");
      // Cypress's findByTestId("dashcard").within(...) throws when the dashcard
      // is absent, so the existence check is part of the upstream assertion.
      await expect(dashcard).toHaveCount(1);
      await assertActionsDropdownNotExists(dashcard);

      await mb.signOut();
    });
  });

  test.describe("in modal", () => {
    // Upstream: { viewportHeight: 1200, requestTimeout: 10000 } — "These tests
    // time out frequently in CI on `POST /api/dataset`".
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1200 });
    });

    const permissionLevels = [
      { name: "admin", user: "admin" as const },
      { name: "normal", user: "normal" as const },
    ];

    for (const { name, user } of permissionLevels) {
      test(`should be able to run update and delete actions when enabled for a ${name} user`, async ({
        page,
        mb,
      }) => {
        // As ${name} user: verify there are no model actions to run
        await mb.signIn(user);
        await visitObjectDetail(page, modelId, FIRST_SCORE_ROW_ID);
        await assertActionsDropdownNotExists(objectDetailModal(page));
        await mb.signOut();

        await mb.signInAsAdmin();
        await createImplicitActions(mb.api, { modelId });
        await mb.signOut();

        await mb.signIn(user);

        // As ${name} user: verify there are model actions to run (1)
        await visitObjectDetail(page, modelId, FIRST_SCORE_ROW_ID);
        await assertActionsDropdownExists(objectDetailModal(page));

        // does not close object detail modal when pressing Esc while action
        // modal is open
        await openUpdateObjectModal(page);
        await waitForAlias(page, "prefetchValues");
        // NB: assert on the modal's CONTENT, not the Mantine Modal root — the
        // root reports `hidden` to Playwright even while open and interactive.
        await expect(actionForm(actionExecuteModal(page))).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(actionExecuteModal(page)).toHaveCount(0);
        await expect(objectDetailModal(page)).toBeVisible();

        // As ${name} user: verify update form gets prefilled
        await openUpdateObjectModal(page);
        {
          const modal = actionExecuteModal(page);
          const request = await waitForAlias(page, "prefetchValues");
          const firstScoreRow = (await request.json()) as ScoreRow;
          await assertScoreFormPrefilled(actionForm(modal), firstScoreRow);
          await modal.getByRole("button", { name: "Close", exact: true }).click();
        }
        await closeObjectDetailModal(page);

        // As ${name} user: verify there are model actions to run (2)
        await openObjectDetailModal(page, SECOND_SCORE_ROW_ID);
        await assertActionsDropdownExists(objectDetailModal(page));

        // As ${name} user: verify form gets prefilled with values for another
        // entity and run update action
        await openUpdateObjectModal(page);
        {
          const modal = actionExecuteModal(page);
          const request = await waitForAlias(page, "prefetchValues");
          const secondScoreRow = (await request.json()) as ScoreRow;
          const form = actionForm(modal);
          await assertScoreFormPrefilled(form, secondScoreRow);

          await form
            .getByLabel("Score", { exact: true })
            .fill(String(UPDATED_SCORE));
          await form.getByText("Update", { exact: true }).click();
        }
        await closeObjectDetailModal(page);
        await assertToast(page, "Successfully updated");
        // updated quantity should be present in the table
        await expect(
          tableInteractive(page).getByText(UPDATED_SCORE_FORMATTED, {
            exact: true,
          }),
        ).toHaveCount(1);

        // As ${name} user: run delete action
        await openObjectDetailModal(page, SECOND_SCORE_ROW_ID);
        await assertActionsDropdownExists(objectDetailModal(page));
        await openDeleteObjectModal(page);
        await deleteObjectModal(page)
          .getByText("Delete forever", { exact: true })
          .click();
        await assertToast(page, "Successfully deleted");
        // updated quantity should not be present in the table
        await expect(
          tableInteractive(page).getByText(UPDATED_SCORE_FORMATTED, {
            exact: true,
          }),
        ).toHaveCount(0);

        await mb.signOut();
      });
    }
  });

  test("should show detailed form errors for constraint violations when executing model actions", async ({
    page,
    mb,
  }) => {
    const actionName = "Update";

    await mb.signInAsAdmin();

    await createImplicitActions(mb.api, { modelId });
    await visitObjectDetail(page, modelId, FIRST_SCORE_ROW_ID);
    await openUpdateObjectModal(page);

    const modal = actionExecuteModal(page);
    await waitForAlias(page, "prefetchValues");

    const form = actionForm(modal);
    await form.getByLabel("Team Name", { exact: true }).fill("Dusty Ducks");
    await form.getByText(actionName, { exact: true }).click();

    await waitForAlias(page, "executeAction");

    await expect(modal.getByLabel("Team Name", { exact: true })).toHaveCount(1);
    await expect(
      modal.getByText("This Team_name value already exists.", { exact: true }),
    ).toHaveCount(1);
    await expect(
      modal.getByText("Team_name already exists.", { exact: true }),
    ).toHaveCount(1);
  });
});
