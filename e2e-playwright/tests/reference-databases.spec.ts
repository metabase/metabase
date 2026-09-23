/**
 * Playwright port of
 * e2e/test/scenarios/onboarding/reference/databases.cy.spec.js
 *
 * Port notes:
 * - `cy.button(/Edit/).trigger("click")` is a *synthetic* click (upstream's TODO
 *   says a real click resets the form straight back out of edit mode) →
 *   `dispatchEvent("click")`, via `startEditingReferenceDetails`. Same treatment
 *   as the already-landed 5276-remove-field-type port.
 * - `cy.contains(str)` is a case-sensitive SUBSTRING match returning the first
 *   DOM hit → case-sensitive regex + `.first()` (PORTING rule 1's corollary),
 *   not an exact `getByText`.
 * - `cy.findByPlaceholderText(str)` is a testing-library exact string match →
 *   `getByPlaceholder(str, { exact: true })` (rule 1).
 * - `cy.contains("Turns out").should("have.length", 0)`: `cy.contains` re-queries
 *   on every retry and yields an empty jQuery set when nothing matches, so this
 *   IS a retrying absence assertion (unlike `should("not.exist")`, which is
 *   one-shot) → `toHaveCount(0)`.
 * - The `xit` and the two `{ tags: "@skip" }` tests are ported as `test.skip`,
 *   faithfully — they do not run upstream either.
 * - Snowplow: the x-ray describe's events ARE the subject, so rule 6's no-op
 *   stub would make both tests vacuous. Captured at the browser boundary with
 *   `installSnowplowCapture` (support/search-snowplow.ts) instead — no
 *   snowplow-micro container. `H.expectNoBadSnowplowEvents` degrades to a
 *   structural check (see that module's docstring): it does NOT catch Iglu
 *   schema-validation failures.
 * - `cy.intercept("GET", "/api/automagic-dashboards/**")` + `cy.wait` →
 *   `waitForXray` registered before the triggering click (rule 2).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { entityPickerModalLevel, startNewQuestion } from "../support/notebook";
import {
  addSQLiteDatabase,
  entityPickerModalItem,
} from "../support/question-new";
import {
  referenceSidebarItem,
  startEditingReferenceDetails,
} from "../support/reference-databases";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { popover } from "../support/ui";
import { waitForXray } from "../support/x-rays";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

test.describe("scenarios > reference > databases", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should see the listing", async ({ page }) => {
    await page.goto("/reference/databases");
    await expect(page.getByText(/Sample Database/).first()).toBeVisible();
  });

  // Upstream is an `xit` — kept skipped.
  test.skip("should let the user navigate to details", async ({ page }) => {
    await page.goto("/reference/databases");
    await page.getByText(/Sample Database/).first().click();
    await expect(
      page.getByText(/Why this database is interesting/).first(),
    ).toBeVisible();
  });

  test("should let an admin edit details about the database", async ({
    page,
  }) => {
    await page.goto("/reference/databases/1");

    await startEditingReferenceDetails(page);

    await page
      .getByPlaceholder("No description yet", { exact: true })
      .fill("A pretty ok store");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(/A pretty ok store/).first()).toBeVisible();
  });

  test("should let an admin start to edit and cancel without saving", async ({
    page,
  }) => {
    await page.goto("/reference/databases/1");

    await startEditingReferenceDetails(page);

    await page
      .getByPlaceholder("Nothing interesting yet", { exact: true })
      .fill("Turns out it's not");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    // Upstream only asserts the text is gone. That alone would also pass if
    // Cancel left the form mounted (a textarea's typed value is not a DOM text
    // node, so `cy.contains` could never see it either way), so first pin down
    // that edit mode actually ended — then the absence check is about the
    // rendered description, which is what the test is named for.
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/Turns out/)).toHaveCount(0);
  });

  test("should let an admin edit the database name", async ({ page }) => {
    await page.goto("/reference/databases/1");

    await startEditingReferenceDetails(page);

    // `clear().type(...)`: the header input is a TextInputBlurChange rendered
    // uncontrolled (value=undefined, defaultValue="Sample Database") whose
    // onChange is formik's, so a single fill() drives the same state updates.
    await page
      .getByPlaceholder("Sample Database", { exact: true })
      .fill("My definitely profitable business");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      page.getByText(/My definitely profitable business/).first(),
    ).toBeVisible();
  });

  test.describe("multiple databases sorting order", () => {
    test.beforeEach(async ({ mb }) => {
      for (const name of ["d", "b", "a", "c"]) {
        await addSQLiteDatabase(mb.api, { name });
      }
    });

    // Upstream carries { tags: "@skip" } — kept skipped.
    test.skip("should sort data reference database list (metabase#15598)", async ({
      page,
    }) => {
      await page.goto("/browse");
      await checkReferenceDatabasesOrder(page);

      await page.goto("/reference/databases/");
      await checkReferenceDatabasesOrder(page);
    });

    test("should sort databases in new UI based question data selection popover", async ({
      page,
    }) => {
      await startNewQuestion(page);
      await miniPickerBrowseAll(page).click();
      await entityPickerModalItem(page, 0, "Databases").click();

      const level1 = entityPickerModalLevel(page, 1);
      await expect(level1.locator("[data-index='0']")).toContainText("a");
      await expect(level1.locator("[data-index='1']")).toContainText("b");
      await expect(level1.locator("[data-index='2']")).toContainText("c");
      await expect(level1.locator("[data-index='3']")).toContainText("d");
      await expect(level1.locator("[data-index='4']")).toContainText(
        "Sample Database",
      );
    });

    // Upstream carries { tags: "@skip" } — kept skipped. Note the upstream
    // helper `checkQuestionSourceDatabasesOrder` declares no parameters, so the
    // "Native query" argument it is called with is silently discarded.
    test.skip("should sort databases in new native question data selection popover", async ({
      page,
    }) => {
      await checkQuestionSourceDatabasesOrder(page);
    });
  });

  test.describe("x-ray", () => {
    let snowplow: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      // H.resetSnowplow() + H.enableTracking(): the capture starts empty and
      // forces anon-tracking/snowplow on in the browser.
      await mb.restore();
      await mb.signInAsAdmin();
      snowplow = await installSnowplowCapture(page, mb.baseUrl);
    });

    test.afterEach(() => {
      expectNoBadSnowplowEvents(snowplow);
    });

    test("should x-ray a table in a data reference page", async ({ page }) => {
      await page.goto(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${PEOPLE_ID}`,
      );

      const xray = waitForXray(page);
      await referenceSidebarItem(page, "X-ray this table").click();
      await xray;

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "x-ray_clicked",
        event_detail: "table",
        triggered_from: "data_reference",
      });
    });

    test("should x-ray a field in a data reference page", async ({ page }) => {
      await page.goto(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${PEOPLE_ID}/fields/${PEOPLE.EMAIL}`,
      );

      const xray = waitForXray(page);
      await referenceSidebarItem(page, "X-ray this field").click();
      await xray;

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "x-ray_clicked",
        event_detail: "field",
        triggered_from: "data_reference",
      });
    });
  });
});

/**
 * Port of the spec-local checkReferenceDatabasesOrder(). Only reached by the
 * @skip-tagged test.
 */
async function checkReferenceDatabasesOrder(page: Page) {
  const databaseCard = page.locator('[class*="Card"]');
  await expect(databaseCard.first()).toHaveText("a");
  await expect(databaseCard.last()).toHaveText("Sample Database");
}

/**
 * Port of the spec-local checkQuestionSourceDatabasesOrder(). Only reached by
 * the @skip-tagged test.
 */
async function checkQuestionSourceDatabasesOrder(page: Page) {
  const LAST_DATABASE_INDEX = -1;

  await startNewQuestion(page);
  const scope = popover(page);
  await scope.getByText("Raw Data", { exact: true }).click();
  const databaseName = scope.locator("[data-element-id=list-item]-title");
  await expect(databaseName.nth(1)).toHaveText("a");
  await expect(databaseName.nth(LAST_DATABASE_INDEX)).toHaveText(
    "Sample Database",
  );
}
