/**
 * Playwright port of
 * e2e/test/scenarios/admin/admin-reproductions.cy.spec.js
 *
 * Seven independent reproduction describes across the admin surface: model
 * persistence, non-default locale, back-navigation, the in-browser table
 * metadata cache, the admin navbar's responsive layout, the segment editor's
 * filter picker, and the (EE) caching strategy form.
 *
 * Port notes
 * ----------
 * - **Infra tiers, per describe** (upstream tags in brackets):
 *   - `issue 26470` [@external] — restores `postgres-writable`, drives the
 *     writable-Postgres container → gated on `PW_QA_DB_ENABLED`.
 *   - `issue 41765` [@external] — same, plus DDL against the container.
 *   - `issue 45890` [untagged upstream] — calls `H.activateToken(
 *     "pro-self-hosted")` in its `beforeEach`. The tag is *missing* upstream;
 *     the gate is real. `/admin/performance/databases` only renders the
 *     per-database "Edit policy for database '…'" launchers when the caching
 *     plugin registers `PLUGIN_CACHING.StrategyFormLauncherPanel`, which
 *     `enterprise/frontend/src/metabase-enterprise/caching/index.tsx:23`
 *     does only under `hasPremiumFeature("cache_granular_controls")`. Ported
 *     with the token activation intact and gated on `resolveToken`.
 *   - The other four are plain `mb.restore()` sample-DB tests, no token.
 * - `cy.intercept(url).as()` + `cy.wait("@x").its("response.statusCode")` →
 *   `page.waitForResponse` registered before the click, `status()` asserted
 *   after (rule 2). Upstream's intercept pins no method, so neither does the
 *   predicate; only POST ever hits those routes.
 * - `cy.findByLabelText("Model persistence")` resolves the `<Switch>` input
 *   via `<Label htmlFor="model-persistence-toggle">` — a real `<label for>`
 *   with static text, so the "accessible-name-is-state" placeholder trap does
 *   *not* apply here (the name never changes with the toggle state). The
 *   `click({force:true})` is Cypress's synthetic force click; the faithful
 *   equivalent for a Mantine Switch input is a plain click on the
 *   `role="switch"` input (PORTING rule 4).
 * - `cy.findByTestId(x)` with no assertion is Cypress's implicit existence
 *   check → `toBeAttached()`, not `toBeVisible()`.
 * - `cy.location().should(...)` was retried by Cypress → `expect.poll`.
 * - `cy.viewport(500, 750)` → `page.setViewportSize`. Note the harness starts
 *   at 1280×720 (not the configured 800) — irrelevant here, since both the
 *   before and after widths sit on the intended side of Mantine's `md`
 *   (768px) breakpoint.
 * - `should("exist")` on a `getByRole` locator: testing-library's ByRole
 *   excludes elements hidden from the a11y tree by default, and so does
 *   Playwright's role engine — so the `visibleFrom="md"` desktop "Settings"
 *   link (which is `display:none` at 500px) is excluded by both, and the
 *   assertion resolves to exactly one element in each harness.
 * - `should("have.text", …)` → `toHaveText`, which normalises whitespace.
 *   The two filter-pill strings are single-line prose; formatting is not the
 *   subject, so the normalisation is not load-bearing.
 * - `H.popover().last()` (the operator Menu dropdown stacked over the filter
 *   popover) → `popover(page).last()`, kept verbatim.
 * - `H.waitForSyncToFinish` has no existing port; the one in
 *   `support/admin-reproductions.ts` reproduces upstream's predicate
 *   *including its weakness* (see that file's doc comment and the findings).
 * - `H.resyncDatabase`/`resetTestTable`/`queryWritableDB` reuse the existing
 *   shared ports (schema-viewer.ts / actions-on-dashboards.ts).
 */
import type { Page } from "@playwright/test";

import {
  resetTestTable,
  queryWritableDB,
} from "../support/actions-on-dashboards";
import {
  SAMPLE_DB_ID,
  WRITABLE_DB_ID,
  scopeWritableDbToPublicSchema,
  segmentEditorPopover,
  setPickerStartingFrom,
  waitForSyncToFinish,
} from "../support/admin-reproductions";
import { resolveToken } from "../support/api";
import { goToAdmin, getProfileLink } from "../support/command-palette";
import { mainAppLinkText } from "../support/custom-viz";
import { pickEntity } from "../support/entity-picker";
import { goToMainApp } from "../support/filters-repros";
import { getNotebookStep, miniPicker } from "../support/notebook";
import { setPickerValue } from "../support/relative-datetime";
import { resyncDatabase } from "../support/schema-viewer";
import { appBar, main, popover } from "../support/ui";
import { expect, test } from "../support/fixtures";

test.describe("issue 26470", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "@external: needs the writable Postgres container",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.post("/api/persist/enable");
  });

  test("Model Cache enable / disable toggle should reflect current state", async ({
    page,
    mb,
  }) => {
    const persistPath = `/api/persist/database/${WRITABLE_DB_ID}/persist`;
    const unpersistPath = `/api/persist/database/${WRITABLE_DB_ID}/unpersist`;

    const toggle = () =>
      page
        .getByTestId("database-model-features-section")
        .getByLabel("Model persistence", { exact: true });

    await page.goto(`${mb.baseUrl}/admin/databases/${WRITABLE_DB_ID}`);

    await expect(toggle()).not.toBeChecked();
    const persist = page.waitForResponse(
      (response) => new URL(response.url()).pathname === persistPath,
    );
    await toggle().click({ force: true });
    expect((await persist).status()).toBe(204);

    await expect(toggle()).toBeChecked();
    const unpersist = page.waitForResponse(
      (response) => new URL(response.url()).pathname === unpersistPath,
    );
    await toggle().click({ force: true });
    expect((await unpersist).status()).toBe(204);

    await expect(toggle()).not.toBeChecked();
  });
});

test.describe("issue 33035", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const current = await (await mb.api.get("/api/user/current")).json();
    await mb.api.put(`/api/user/${current.id}`, { locale: "de" });
  });

  test("databases page should work in a non-default locale (metabase#33035)", async ({
    page,
    mb,
  }) => {
    await page.goto(
      `${mb.baseUrl}/admin/permissions/data/database/${SAMPLE_DB_ID}`,
    );
    await expect(
      page.getByRole("main").getByText("Orders", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 21532", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow navigating back from admin settings (metabase#21532)", async ({
    page,
    mb,
  }) => {
    await page.goto(`${mb.baseUrl}/`);

    await goToAdmin(page);
    // Upstream's bare `cy.findByTestId(...)` is an implicit existence check.
    await expect(page.getByTestId("admin-layout-content")).toBeAttached();

    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/");
  });
});

test.describe("issue 41765", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "@external: needs the writable Postgres container",
  );

  // In this test we are testing the in-browser cache that metabase uses,
  // so we need to navigate by clicking trough the UI without reloading the page.

  const WRITABLE_DB_DISPLAY_NAME = "Writable Postgres12";

  const TEST_TABLE = "scoreboard_actions";
  const TEST_TABLE_DISPLAY_NAME = "Scoreboard Actions";

  const COLUMN_NAME = "another_column";
  const COLUMN_DISPLAY_NAME = "Another Column";

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: TEST_TABLE });
    await mb.signInAsAdmin();

    // Environment compensation, not upstream — see the helper's doc comment.
    await scopeWritableDbToPublicSchema(mb.api);

    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [TEST_TABLE],
    });
  });

  async function openWritableDatabaseQuestion(page: Page) {
    // start new question without navigating
    await appBar(page).getByText("New", { exact: true }).click();
    await popover(page).getByText("Question", { exact: true }).click();

    const picker = miniPicker(page);
    await picker.getByText(WRITABLE_DB_DISPLAY_NAME, { exact: true }).click();
    await picker
      .getByText(TEST_TABLE_DISPLAY_NAME, { exact: true })
      .click();
  }

  test("re-syncing a database should invalidate the table cache (metabase#41765)", async ({
    page,
    mb,
  }) => {
    await page.goto(`${mb.baseUrl}/`);
    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

    await openWritableDatabaseQuestion(page);

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await expect(
      popover(page).getByText(COLUMN_DISPLAY_NAME, { exact: true }),
    ).toHaveCount(0);

    await goToAdmin(page);

    await appBar(page).getByText("Databases", { exact: true }).click();
    await page
      .getByRole("link")
      .filter({ hasText: new RegExp(WRITABLE_DB_DISPLAY_NAME) })
      .first()
      .click();

    await queryWritableDB(
      `ALTER TABLE ${TEST_TABLE} ADD ${COLUMN_NAME} text;`,
      "postgres",
    );

    await page
      .getByRole("button", { name: "Sync database schema", exact: true })
      .click();
    await waitForSyncToFinish(mb.api, {
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });

    await goToMainApp(page);
    await openWritableDatabaseQuestion(page);

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await expect(
      popover(page).getByText(COLUMN_DISPLAY_NAME, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("(metabase#45042)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("Should display tabs in normal view, and a nav menu in mobile view", async ({
    page,
    mb,
  }) => {
    await page.goto(`${mb.baseUrl}/admin`);

    const navbar = page.getByTestId("admin-navbar");

    //Ensure tabs are present in normal view
    await expect(
      navbar.getByRole("link", { name: "Settings", exact: true }),
    ).toBeAttached();
    await expect(getProfileLink(page)).toBeAttached();

    //Shrink viewport
    await page.setViewportSize({ width: 500, height: 750 });

    //ensure that hamburger is visible and functional
    const burger = navbar.getByRole("button", { name: /burger/ });
    await expect(burger).toBeVisible();
    await burger.click();
    await expect(
      navbar.getByRole("list", { name: "Navigation links", exact: true }),
    ).toBeAttached();
    await expect(
      navbar.getByRole("link", { name: "Settings", exact: true }),
    ).toBeAttached();

    // dismiss nav list
    const pageBurger = page.getByRole("button", { name: /burger/ });
    await expect(pageBurger).toBeVisible();
    await pageBurger.click();
    await expect(
      page.getByRole("list", { name: "Navigation links", exact: true }),
    ).toHaveCount(0);

    //ensure that app switcher is visible and functional
    await getProfileLink(page).click();
    await expect(
      popover(page).getByText(mainAppLinkText, { exact: true }),
    ).toBeAttached();
  });
});

test.describe("(metabase#46714)", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await page.goto(`${mb.baseUrl}/admin/datamodel/segment/create`);

    const editor = page.getByTestId("segment-editor");
    await editor.getByText("Select a table", { exact: true }).click();

    await pickEntity(page, {
      path: ["Databases", /Sample Database/, "Orders"],
      leaf: true,
    });

    await expect(page.getByTestId("entity-picker-modal")).toHaveCount(0);
    await expect(editor.getByText("Orders", { exact: true })).toBeVisible();

    await editor
      .getByText("Add filters to narrow your answer", { exact: true })
      .click();
  });

  test("should allow users to apply relative date options in the segment date picker", async ({
    page,
  }) => {
    const filterPopover = popover(page);
    await filterPopover.getByText("Created At", { exact: true }).click();
    await filterPopover
      .getByText("Relative date range…", { exact: true })
      .click();
    await filterPopover
      .getByRole("tab", { name: "Previous", exact: true })
      .click();
    await filterPopover.getByLabel("Starting from…").click();

    await setPickerValue(
      page,
      { value: 68, unit: "day" },
      segmentEditorPopover(page),
    );

    await setPickerStartingFrom(
      page,
      { value: 70, unit: "day" },
      segmentEditorPopover(page),
    );

    await popover(page).getByText("Add filter", { exact: true }).click();

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Created At is in the previous 68 days, starting 70 days ago",
    );
  });

  test("should not hide operator select menu behind the main filter popover", async ({
    page,
  }) => {
    await popover(page).getByText("Total", { exact: true }).click();

    const operator = page.getByLabel("Filter operator", { exact: true });
    await expect(operator).toHaveText("Between");
    await operator.click();
    await popover(page).last().getByText("Less than", { exact: true }).click();
    await expect(operator).toHaveText("Less than");
    const numberInput = popover(page).getByPlaceholder("Enter a number", {
      exact: true,
    });
    await numberInput.fill("1000");
    await popover(page).getByText("Add filter", { exact: true }).click();

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Total is less than 1000",
    );
  });
});

test.describe("issue 45890", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "needs the pro-self-hosted token (cache_granular_controls)",
  );

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await page.goto(`${mb.baseUrl}/admin/performance/databases`);
    await main(page)
      .getByLabel(/Edit policy for database 'Sample Database'/)
      .getByText("No caching", { exact: true })
      .click();

    // The strategy picker is a dropdown; its options render in a portal.
    await main(page).getByTestId("cache-strategy-select").click();
    await page.getByRole("option", { name: /Schedule/ }).click();

    await main(page)
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
  });

  test("should correctly reset caching schedule form when discarding changes", async ({
    page,
  }) => {
    await main(page).getByLabel("Frequency").click();
    await popover(page).getByText("weekly", { exact: true }).click();

    await main(page)
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(main(page).getByLabel("Frequency")).toHaveValue("hourly");
  });
});
