/**
 * Playwright port of e2e/test/scenarios/sharing/alert/alert-types.cy.spec.js
 *
 * Notes on the port:
 *
 * - Spec-local helpers live in support/alert-types.ts (the multi-series
 *   question fixture, and the two response-wait helpers standing in for the
 *   upstream `cy.intercept` aliases). Everything else is imported read-only
 *   from existing shared modules.
 *
 * - GATE (upstream tag vs what the code actually needs): the file's single
 *   `describe(…, { tags: "@external" })` is REAL and applies to every test,
 *   because the shared `beforeEach` calls `H.setupSMTP()`. `PUT /api/email`
 *   LIVE-CONNECTS before saving (metabase.channel.email/check-and-update-
 *   settings → test-smtp-connection), so maildev on :1025 must be up or the
 *   hook 400s. Probed rather than assumed: a dead port 1026 gives 400, the
 *   live 1025 gives 200.
 *   The tag is nonetheless OVER-BROAD about *which* container and about *what*
 *   maildev does for this file. No test here sends or reads mail — SMTP is
 *   configured purely so that the alert modal has at least one available
 *   channel and the "New alert" form renders. And nothing contacts
 *   webhook-tester: `GET /api/channel` only LISTS the `channel` table (the
 *   connection test is the separate `POST /api/channel/test`). Confirmed by
 *   request-count delta against :9080 — 1 before, 1 after.
 *   Because no assertion reads delivered mail, this spec is NOT exposed to the
 *   shared maildev inbox. It is, however, an EXPOSER: `setupSMTP` DELETEs the
 *   inbox on every test, which is upstream's behaviour and is not deviated
 *   from here. Recorded in findings-inbox/alert-types.md for the siblings.
 *
 * - TOKEN: no predicate applies. This spec never calls `H.activateToken`, and
 *   nothing on the alert-creation path is feature gated — `send_condition` /
 *   `send_once` live on the OSS notification model, and
 *   CreateOrEditQuestionAlertModal has no `PLUGIN_*` / feature check on the
 *   goal select. Verified by running against the post-restore instance, whose
 *   `token-features` map has ZERO enabled features. No two-arm control is
 *   applicable: there is no arm to vary.
 *
 * - SNOWPLOW: none. Alerts emit no events — no `trackSimpleEvent` /
 *   `trackSchemaEvent` under frontend/src/metabase/notifications/, and no
 *   analytics emission in the backend notification namespaces. Verified, not
 *   assumed.
 *
 * - 🔴 `should("not.be.enabled")` / `should("be.enabled")` do NOT port to
 *   `toBeDisabled()` / `toBeEnabled()`, and getting this wrong would have made
 *   the tests fail for a reason unrelated to the product.
 *   `alert-goal-select` is TWO DIFFERENT ELEMENTS depending on the branch
 *   (CreateOrEditQuestionAlertModal.tsx:327/338):
 *     * `hasSingleTriggerOption` → a Mantine `<Paper>`, i.e. a plain `<div>`
 *     * otherwise                → a Mantine `<Select>`, i.e. an `<input>`
 *   Sizzle's `:enabled` is `elem.disabled === false`. On the `<div>`,
 *   `disabled` is `undefined`, so `:enabled` does not match and Cypress's
 *   `not.be.enabled` passes. Playwright's `toBeDisabled()` uses the ARIA
 *   notion of disabled and considers a bare `<div>` ENABLED, so
 *   `not.toBeEnabled()` would FAIL against unchanged product code.
 *   `toHaveJSProperty("disabled", …)` reproduces the jQuery predicate exactly
 *   and keeps the discriminating power upstream actually has: if the single-
 *   option branch ever regressed to rendering a Select, `disabled` would be
 *   `false` on the resolved input and the assertion would fail. Documented as
 *   a faithful re-expression, not a weakening.
 *   (`toHaveJSProperty` also requires the locator to resolve, so the element's
 *   existence is asserted just as `cy.findByTestId` asserts it.)
 *
 * - There are NO absence assertions in this spec — no `should("not.exist")`,
 *   no zero-count. The `not.be.enabled` above is a state assertion on a
 *   resolved element, not a zero-assertion, so the positive-anchor rule does
 *   not apply. Stated explicitly so its absence is not mistaken for an
 *   oversight.
 *
 * - `cy.findByText("Done").click()` → `getByRole("button", …)`. Under
 *   Playwright the text form matches both the Mantine Button label span and
 *   its inner wrapper (full-textContent matching), a strict-mode violation.
 *   Same call the sibling ports (alert.spec.ts / alert-permissions.ts) make
 *   for the identical upstream line. Upstream's second occurrence is already
 *   `cy.button("Done")`, which is this exact locator.
 *
 * - `H.createQuestion(details, { visitQuestion: true })` → `createQuestion`
 *   then `visitQuestion`; the port's factory has no visit option.
 *
 * - FIXME (upstream, NOT port drift — the port reproduces upstream's fixture
 *   faithfully and is green): the last test does not exercise the guard it is
 *   named after.
 *   The predicate is `getAlertType` (frontend/src/metabase/notifications/
 *   utils.ts:496-509): `graph.show_goal && graph.metrics.length === 1`,
 *   evaluated against the QB's COMPUTED settings (`getVisualizationSettings`
 *   → `getComputedSettingsForSeries`), not the card's raw ones.
 *   `multiSeriesQuestionWithGoal` sets NO `visualization_settings` at all, so
 *   `goalEnabled` is falsy and the multi-series arm is never reached — the test
 *   passes through exactly the same code path as "timeseries question without
 *   a goal", which the rows describe already covers. The fixture's name
 *   promises a goal it never sets.
 *   Probed three ways, all of which rendered an ENABLED Select (i.e. goal
 *   options WERE offered): goal + one raw `graph.metrics` entry; goal + two
 *   raw entries; goal + two aggregations. I could not construct a shape in
 *   which the multi-series guard suppressed the goal options. The two-raw-entry
 *   case is explained (computed settings normalise away a metric that is not a
 *   real result column); the TWO-AGGREGATION case is NOT explained, and is
 *   recorded here as unexplained rather than given an invented mechanism.
 *   Left exactly as upstream wrote it — this is a note for whoever owns the
 *   Cypress spec, not a licence to change the port.
 */
import { expect, test } from "../support/fixtures";
import {
  type AlertNotificationBody,
  multiSeriesQuestionWithGoal,
  waitForAlertSave,
  waitForChannels,
} from "../support/alert-types";
import { createQuestion } from "../support/factories";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { modal, popover, visitQuestion } from "../support/ui";

const timeSeriesQuestionId = ORDERS_BY_YEAR_QUESTION_ID;

const rawTestCases = [
  {
    questionType: "raw data question",
    questionId: ORDERS_QUESTION_ID,
  },
  {
    questionType: "timeseries question without a goal",
    questionId: timeSeriesQuestionId,
  },
];

let maildevUp = false;

test.describe("scenarios > alert > types", () => {
  test.beforeAll(async () => {
    maildevUp = await isMaildevRunning();
  });

  // The upstream describe has NO afterEach (checked, not assumed), so gating in
  // beforeEach is safe — there is no teardown left dangling by an early skip.
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !maildevUp,
      "@external: setupSMTP live-validates against the maildev container (SMTP :1025)",
    );

    await mb.restore();
    await mb.signInAsAdmin();

    await setupSMTP(mb.api);
  });

  test.describe("rows based alerts", () => {
    for (const { questionType, questionId } of rawTestCases) {
      test(`should be supported for ${questionType}`, async ({ page }) => {
        await visitQuestion(page, questionId);

        const channels = waitForChannels(page);
        await page
          .getByLabel("Move, trash, and more…", { exact: true })
          .click();
        await popover(page)
          .getByText("Create an alert", { exact: true })
          .click();
        await channels;

        const dialog = modal(page);
        await expect(
          dialog.getByText("New alert", { exact: true }),
        ).toBeVisible();

        const goalSelect = dialog.getByTestId("alert-goal-select");
        // See the header: the single-option branch renders a <Paper> (a div),
        // whose `disabled` property is undefined. This is the exact jQuery
        // `:enabled` predicate Cypress applies.
        await expect(goalSelect).not.toHaveJSProperty("disabled", false);
        await expect(goalSelect).toHaveText("When this question has results");

        const saved = waitForAlertSave(page);
        await dialog.getByRole("button", { name: "Done", exact: true }).click();

        const body = (await (await saved).json()) as AlertNotificationBody;
        expect(body.payload?.send_condition).toBe("has_result");
      });
    }
  });

  test.describe("goal based alerts", () => {
    test("should work for timeseries questions with a set goal", async ({
      page,
      mb,
    }) => {
      await mb.api.put(`/api/card/${timeSeriesQuestionId}`, {
        visualization_settings: {
          "graph.show_goal": true,
          "graph.goal_value": 7000,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        },
      });

      // cy.log("Set the goal on timeseries question")
      await visitQuestion(page, timeSeriesQuestionId);
      await expect(page.getByTestId("chart-container")).toContainText("Goal");

      const channels = waitForChannels(page);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();
      await channels;

      const dialog = modal(page);
      const goalSelect = dialog.getByTestId("alert-goal-select");
      // The multi-option branch renders a Mantine <Select>, so `alert-goal-
      // select` resolves to the underlying <input> and `disabled` is `false` —
      // the same jQuery predicate as above, asserted in the positive direction.
      await expect(goalSelect).toHaveJSProperty("disabled", false);
      await goalSelect.click();

      const options = popover(page);
      // `getByRole("option")` rather than `getByText`: a Mantine Combobox
      // option nests a <span> inside the option <div>, and Playwright matches
      // on full textContent, so the text form strict-mode-violates on two
      // elements with identical text. The option's accessible name is the same
      // string testing-library matched on.
      await expect(
        options.getByRole("option", { name: "When results go above the goal" }),
      ).toBeVisible();
      await expect(
        options.getByRole("option", { name: "When results go below the goal" }),
      ).toBeVisible();
      await options
        .getByRole("option", { name: "When results go above the goal" })
        .click();

      await dialog
        .getByLabel("Delete this Alert after it's triggered", { exact: true })
        .click();

      const saved = waitForAlertSave(page);
      await dialog.getByRole("button", { name: "Done", exact: true }).click();

      // cy.log("Check the API response")
      const body = (await (await saved).json()) as AlertNotificationBody;
      expect(body.payload?.send_condition).toBe("goal_above");
      expect(body.payload?.send_once).toBe(true);
    });

    test("should not be possible to create goal based alert for a multi-series question", async ({
      page,
      mb,
    }) => {
      const { id: cardId } = await createQuestion(
        mb.api,
        multiSeriesQuestionWithGoal,
      );
      await visitQuestion(page, cardId);

      const channels = waitForChannels(page);
      await page.getByLabel("Move, trash, and more…", { exact: true }).click();
      await popover(page).getByText("Create an alert", { exact: true }).click();
      await channels;

      const dialog = modal(page);
      await expect(
        dialog.getByText("New alert", { exact: true }),
      ).toBeVisible();

      const goalSelect = dialog.getByTestId("alert-goal-select");
      await expect(goalSelect).not.toHaveJSProperty("disabled", false);
      await expect(goalSelect).toHaveText("When this question has results");

      const saved = waitForAlertSave(page);
      await dialog.getByRole("button", { name: "Done", exact: true }).click();

      // The alert condition should fall back to rows
      const body = (await (await saved).json()) as AlertNotificationBody;
      expect(body.payload?.send_condition).toBe("has_result");
    });
  });
});
