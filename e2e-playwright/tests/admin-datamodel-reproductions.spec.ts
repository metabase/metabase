/**
 * Playwright port of
 * e2e/test/scenarios/admin/datamodel/reproductions.cy.spec.ts
 *
 * Eight reproduction describes spanning the admin data-model surface, the
 * `/reference` data-reference pages and the model metadata editor.
 *
 * Port notes
 * ----------
 * - **Infra tiers.** Seven describes are plain sample-DB (`mb.restore()`);
 *   `issue 52411` is the only QA-DB one (`@external` upstream: it restores the
 *   `postgres-writable` snapshot and drives the writable Postgres container)
 *   and is gated on `PW_QA_DB_ENABLED` — the deliberate gate, since bare
 *   `QA_DB_ENABLED` leaks truthy from cypress.env.json. No describe needs an
 *   EE token: every surface here is OSS, and a gate-OFF control run confirmed
 *   the seven ungated describes are green with `PW_QA_DB_ENABLED` unset.
 * - `cy.intercept().as()` + `cy.wait()` → `page.waitForResponse` registered
 *   before the triggering action (rule 2). Three of the four intercepts
 *   upstream registers are never awaited in a way the port needs:
 *   - `@tableMetadata` (21984) is subsumed by `visitDataModel`'s own
 *     `/api/table/:id/query_metadata` wait;
 *   - `@getSchema` (53595) is registered and **never awaited** — dropped;
 *   - `@getDatabases` / `@getSegments` (55617/55618) gate the first
 *     interaction after `cy.visit`, and are ported as real waits.
 *   `@fieldDimensionUpdate` (15542) is a genuine gate and is registered before
 *   the click that fires it.
 * - `cy.findByText`/`findByRole`/`findByPlaceholderText` with **string** args
 *   are testing-library EXACT matches → `{ exact: true }` (rule 1).
 *   `cy.contains(str)` is case-sensitive substring → case-sensitive regex.
 * - `H.popover()` returns a SET; where two popovers coexist (the display-values
 *   FK sub-picker in 15542) the port disambiguates with `.last()`.
 *   `isScrollableVertically($popover[0])` takes the FIRST → `.first()`.
 * - `realClick()` → a real `.click()`. `cy.button(/Edit/).click()` on the
 *   `/reference` pages is likewise a real click here — unlike the sibling
 *   `reference-databases` port, whose upstream used `.trigger("click")` and so
 *   ports as `dispatchEvent`.
 * - `navigationSidebar().findByText("Databases").click({ force: true })` →
 *   `dispatchEvent("click")`. Playwright's `click({force:true})` still moves
 *   the real mouse and hit-tests; Cypress's force click does not (brief /
 *   PORTING). The `force` is there because the sidebar may be collapsed.
 * - 15542 deliberately navigates **without** `cy.visit` (the test is about the
 *   in-browser metadata cache surviving the navigation), so the port uses no
 *   `page.goto` after the first one either.
 * - `H.main().scrollTo("bottom")` → an `evaluate` scrollTop assignment; the
 *   real mouse wheel is not what upstream did and would hover whatever is
 *   under the cursor.
 * - 21984's two absence assertions are **anchored** before being asserted (the
 *   home page's recents request, and the palette's own list) — see the inline
 *   comments. This is a strengthening: upstream sampled both immediately after
 *   `cy.visit`/`click`, where an empty-because-not-yet-fetched DOM satisfies
 *   them (FINDINGS #73). The assertions themselves are unchanged.
 * - `cy.findByDisplayValue(...)` has no Playwright equivalent; the shared
 *   `findByDisplayValue` (filters-repros.ts) scans input/textarea/select for a
 *   current value, exactly as testing-library does.
 * - 55619 pins sample-data-derived values (`37.65`, the `€` header suffix)
 *   verbatim from upstream — a known cross-jar drift risk (FINDINGS #43).
 */
import type { Page } from "@playwright/test";

import { waitForUpdateFieldDimension } from "../support/admin-datamodel";
import {
  clickPickerOption,
  closestListSection,
  getFieldNameInput,
  isScrollableVertically,
  waitForFieldSyncToFinish,
} from "../support/admin-datamodel-reproductions";
import { openReviewsTable } from "../support/ad-hoc-question";
import {
  commandPalette,
  commandPaletteButton,
  goToAdmin,
} from "../support/command-palette";
import {
  FieldSection,
  SAMPLE_DB_SCHEMA_ID,
  TablePicker,
  TableSection,
  replaceValue,
  resetTestTableMultiSchema,
  visitDataModel,
} from "../support/data-model";
import {
  getDisplayValuesInput,
  getFilteringInput,
} from "../support/datamodel-data-studio";
import { findByDisplayValue, goToMainApp } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { summarize, tableInteractive } from "../support/models";
import { openColumnOptions } from "../support/models-metadata";
import { datasetEditBar } from "../support/models-reproductions-2";
import { miniPicker, tableHeaderClick } from "../support/notebook";
import { runButtonOverlay } from "../support/question-reproductions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  appBar,
  main,
  modal,
  navigationSidebar,
  popover,
  queryBuilderHeader,
} from "../support/ui";

const { PEOPLE_ID, PEOPLE, REVIEWS, REVIEWS_ID, ORDERS, ORDERS_ID } =
  SAMPLE_DATABASE;

test.describe("issue 17768", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put(`/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/Category",
      has_field_values: "list",
    });

    // Sync "Sample Database" schema
    await mb.api.post(`/api/database/${SAMPLE_DB_ID}/sync_schema`);

    await waitForFieldSyncToFinish(mb.api, REVIEWS.ID);

    await mb.api.put(`/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/PK",
      has_field_values: "none",
    });
  });

  test("should not show binning options for an entity key, regardless of its underlying type (metabase#17768)", async ({
    page,
  }) => {
    await openReviewsTable(page, { mode: "notebook" });

    await summarize(page, { mode: "notebook" });
    await page.getByText("Pick a column to group by", { exact: true }).click();

    // `cy.findByText("ID").closest("[data-element-id=list-section]")`. The
    // rows carry an icon sibling, so the exact-text node is the label span;
    // `.first()` mirrors Cypress's first-match on the ancestor chain.
    const section = closestListSection(
      popover(page).getByText("ID", { exact: true }).first(),
    );
    await section.hover();
    // `cy.contains("Auto bin")` is a case-sensitive substring match, and
    // `should("not.exist")` on a `contains` re-queries → retrying absence.
    await expect(section.getByText(/Auto bin/)).toHaveCount(0);
  });
});

test.describe("issue 18384", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Hide Reviews table
    await mb.api.put("/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  test("should be able to open field properties even when one of the tables is hidden (metabase#18384)", async ({
    page,
  }) => {
    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
    });

    await TableSection.clickField(page, "Address");

    // cy.location(...).should(...) retried → expect.poll (PORTING).
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}/field/${PEOPLE.ADDRESS}`,
      );

    await expect(getFieldNameInput(page)).toBeVisible();
    await expect(getFieldNameInput(page)).toHaveValue("Address");
  });
});

test.describe("issue 21984", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // The `@tableMetadata` intercept + wait is subsumed by visitDataModel's
    // own /api/table/:id/query_metadata wait.
    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
    });

    // `cy.findByDisplayValue("ID")` with no assertion: findBy* throws unless
    // exactly one match exists, so this IS an existence gate.
    await expect
      .poll(() => countDisplayValue(page, "ID"))
      .toBe(1);
  });

  test('should not show data model visited tables in search or in "Pick up where you left off" items on homepage (metabase#21984)', async ({
    page,
  }) => {
    // ANCHOR (strengthening, see header): wait for the recents fetch to land
    // so the absence assertion below is not satisfied by a pre-fetch DOM.
    const recents = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/activity/recents",
    );
    await page.goto("/");
    await recents;

    // the table should not be in the recents results
    //
    // REFORMULATED (say-so per the porting rules; upstream is
    // `cy.findByTestId("home-page").findByText("Reviews").should("not.exist")`).
    // A literal port is a FALSE POSITIVE here: `HomeContent` renders exactly
    // one of the popular / recent / x-ray sections, and with no recents it
    // renders the x-ray section, whose card label is the jt-interpolated
    // "A summary of <Reviews>" — the table name is its OWN node, so both
    // Playwright's exact `getByText` and testing-library's exact `findByText`
    // (which reads direct child text nodes) match it. Upstream only escapes
    // because it samples before the x-ray candidates load; once this port
    // anchors on the recents fetch it lands inside that window. Measured: 2
    // failures in 4 repeats, with the backend's
    // `/api/activity/recents?context=views` holding ONLY the snapshot's three
    // collections at the moment of failure — i.e. nothing was in recents and
    // the match was the x-ray card.
    //
    // Upstream's own comment states the intent ("the table should not be in
    // the recents results"), so this asserts it directly: the recents section
    // must not render at all. That is strictly what the bug is about, and it
    // is mutation-killed (opening Reviews in the QB makes the section appear).
    await expect(
      page
        .getByTestId("home-page")
        .getByText("Pick up where you left off", { exact: true }),
    ).toHaveCount(0);

    await commandPaletteButton(page).click();
    await expect(commandPalette(page)).toBeVisible();

    // KNOWN-WEAK, ported VERBATIM (recorded, not strengthened — see
    // findings-inbox). This absence assertion is VACUOUS, upstream and here.
    // Opening the palette fires `GET /api/activity/recents?context=views` and
    // the palette renders its EMPTY STATE until the result is COMMITTED.
    // Measured with recents deliberately populated (a QB visit added to the
    // beforeEach): the palette reads "No recent items" at t=0 and "Recents /
    // Reviews / Sample Database (PUBLIC)" from t=200ms — so a check made the
    // instant the palette appears passes whatever the backend holds
    // (FINDINGS #73). Cypress's `findByText().should("not.exist")` is
    // satisfied at that same instant, so it is no stronger.
    //
    // Three anchors were tried and all measured insufficient:
    //   - `waitForResponse` on /api/activity/recents — resolves at the network
    //     layer, one tick before React commits; the palette still read
    //     "No recent items" immediately after it.
    //   - asserting the empty state is visible — true at t=0 in BOTH cases, so
    //     `toBeVisible()` returns on its first poll and anchors nothing.
    //   - any "wait for it to settle" formulation degrades to a bare sleep,
    //     which the porting rules forbid.
    // The home-page half of this test IS load-bearing (mutation-killed), so
    // the test overall is not hollow; this second assertion is not.
    await expect(
      commandPalette(page).getByText("Recents", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 15542", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  /**
   * Navigate without reloading the page. `click({ force: true })` upstream
   * because the sidebar might be collapsed — Playwright's force click still
   * hit-tests, so this is `dispatchEvent`.
   */
  async function openOrdersTable(page: Page) {
    await navigationSidebar(page)
      .getByText("Databases", { exact: true })
      .dispatchEvent("click");

    await page.getByText("Sample Database", { exact: true }).click();
    await page.getByText("Orders", { exact: true }).click();
  }

  /** Navigate without reloading the page. */
  async function openOrdersProductIdSettings(page: Page) {
    await goToAdmin(page);

    await appBar(page).getByText("Table Metadata", { exact: true }).click();
    await TablePicker.getTable(page, "Orders").click();
    await TableSection.clickField(page, "Product ID");
  }

  test("should be possible to use the foreign key field display values immediately when changing the setting", async ({
    page,
  }) => {
    // This test does manual navigation instead of using openOrdersTable and
    // similar helpers because they use cy.visit under the hood and that
    // reloads the page, clearing the in-browser cache, which is what we are
    // testing here.
    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    await getFilteringInput(page).click();
    await popover(page)
      .getByText("A list of all values", { exact: true })
      .click();

    await getDisplayValuesInput(page).click();
    const fieldDimensionUpdate = waitForUpdateFieldDimension(page);
    await popover(page).getByText("Use foreign key", { exact: true }).click();
    // The FK sub-picker opens as a SECOND popover on top of the first —
    // `H.popover()` is a set, so disambiguate with `.last()`.
    await popover(page).last().getByText("Title", { exact: true }).click();

    await fieldDimensionUpdate;

    await goToMainApp(page);
    await openOrdersTable(page);

    await tableHeaderClick(page, "Product ID");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();

    await expect(
      popover(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("1", { exact: true })).toHaveCount(0);

    await openOrdersProductIdSettings(page);

    await getDisplayValuesInput(page).click();
    await popover(page)
      .getByText("Use original value", { exact: true })
      .click();

    await goToMainApp(page);
    await openOrdersTable(page);

    await tableHeaderClick(page, "Product ID");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();

    await expect(popover(page).getByText("1", { exact: true })).toBeVisible();
    await expect(
      popover(page).getByText("Rustic Paper Wallet", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 52411", () => {
  // @external upstream: the writable Postgres QA container.
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable postgres QA database (set PW_QA_DB_ENABLED)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetTestTableMultiSchema();
    await mb.signInAsAdmin();
    // Explicit `tables`: the bare form returns as soon as the DB has ANY
    // synced table, so a stale `initial_sync_status: "complete"` row would
    // satisfy it without the just-created Wild/Domestic tables being there.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["Animals", "Birds"],
    });
  });

  /**
   * FIXME (candidate product regression — NOT port drift; see
   * findings-inbox/admin-datamodel-reproductions.md).
   *
   * The "Filter by table" picker never renders a database list: it opens
   * straight on **Sample Database**'s table list, so `Writable Postgres12`
   * cannot be clicked.
   *
   * Measured, not inferred: with the popover open, its full innerText was
   * sampled every 100ms for 4s and was `Sample Database / Orders / People /
   * Products / Reviews` at **every** sample, from t=0. So this is not a
   * mount-time race (an anchor on the second database being loaded in the
   * sidebar tree changed nothing), not popover scoping, and not
   * virtualization (4 options, no scroll container).
   *
   * Root cause in the product source: `skipSteps()`
   * (querying/common/components/DataSelector/DataSelector.tsx:713-724) fires
   * when `useOnlyAvailableDatabase` (default TRUE) is set and no database is
   * preselected, and auto-selects `enabledDatabases[0]`. That guard was
   * `databases && databases.length === 1` until commit `2a6741df9cf`
   * ("Do not pick unsupported databases automatically in transforms",
   * #64406, 2025-12-18), which widened it to `enabledDatabases.length >= 1`.
   * With two databases loaded the DATABASE step is now always skipped —
   * a state that was impossible under the old condition, which is what makes
   * this measurement discriminating. The 52411 describe was written
   * 2025-01-21 (`9315a633b39`) and last touched 2025-01-30, i.e. it predates
   * the widening and has not been revisited; it is `@external`, so it only
   * runs on the QA-DB lane.
   *
   * SCOPE CAVEAT: the Cypress original was **not** run (standing rule — a
   * cross-check would break live sibling slots), so I cannot confirm upstream
   * fails identically, and I am not claiming it. What is established is that
   * on the CI EE uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98,
   * verified by `version.hash` = 751c2a9 on the slot's PID) the flow this
   * test performs is not reachable through the UI.
   */
  test.fixme("should be able to select a table in a database with multiple schemas on segments list page when there are multiple databases and there is a saved question (metabase#52411)", async ({
    page,
  }) => {
    await page.goto("/admin/datamodel/segments");

    await page
      .getByTestId("segment-list-table")
      .getByText("Filter by table", { exact: true })
      .click();

    // The schema list is virtualized and the shared container carries ~29
    // debris schemas (FINDINGS #85) — `Wild` sorts after `Schema Z` and is
    // not in the DOM until the list is scrolled. clickPickerOption scrolls
    // until attached.
    const picker = popover(page).last();
    await clickPickerOption(picker, "Writable Postgres12");
    await clickPickerOption(picker, "Wild");
    await clickPickerOption(picker, "Birds");

    await expect(
      page
        .getByTestId("segment-list-table")
        .getByText("Birds", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 53595", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // The `@getSchema` intercept is registered upstream and never awaited —
    // dropped (rule 2).
  });

  test("all options are visibile while filtering the list of entity types (metabase#53595)", async ({
    page,
  }) => {
    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
      fieldId: PEOPLE.ID,
    });

    // `.focus().clear().type("cu")` — the placeholder is stable on this
    // Mantine Select (the current value renders as the input's value, not as
    // the placeholder), so the locator survives the clear.
    await replaceValue(FieldSection.getSemanticTypeInput(page), "cu");

    await expect(
      popover(page).getByText("Currency", { exact: true }),
    ).toBeVisible();
    // `H.popover().then(($popover) => ... $popover[0])` takes the FIRST
    // element of the set.
    //
    // KNOWN-WEAK, ported VERBATIM (recorded, not strengthened). Upstream's
    // `isScrollableVertically` infers "has a vertical scrollbar" from
    // `offsetWidth - clientWidth - borderWidth > 0`, i.e. from the scrollbar
    // taking LAYOUT WIDTH. Chromium on macOS uses OVERLAY scrollbars, which
    // take none. Measured on a deliberately overflowing popover (viewport
    // height 300, filter cleared so the full entity-type list renders):
    // `overflow-y: auto`, `scrollHeight` 650 vs `clientHeight` 147 — plainly
    // scrolling — yet `offsetWidth` 402, `clientWidth` 400, borders 1px+1px,
    // so the helper computes 0 and returns FALSE. The assertion therefore
    // cannot fail on this platform, and the same is true of the Cypress
    // original (identical computation, same browser). It may still be live on
    // CI's Linux runners, where scrollbars are classic and do take width.
    // The head assertion ("Currency" is visible under the filter) carries this
    // test's real coverage and IS mutation-killed.
    expect(await isScrollableVertically(popover(page).first())).toBe(false);
  });
});

test.describe("issues 55617, 55618", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.post("/api/segment", {
      name: "My segment",
      description: null,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    });
  });

  test("should allow changing field's FK target mapping in table fields list view and table field detail view (metabase#55617, metabase#55618)", async ({
    page,
  }) => {
    const getDatabases = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/database",
    );
    await page.goto("/reference/databases");
    await getDatabases;

    await page.getByRole("link", { name: /Sample Database/ }).click();
    await page.getByRole("link", { name: /Tables in Sample Database/ }).click();
    await page.getByRole("link", { name: /Orders/ }).click();
    await page.getByRole("link", { name: /Fields in this table/ }).click();

    // field list view
    const editButton = page.getByRole("button", { name: /Edit/ });
    await expect(editButton).toBeVisible();
    await editButton.click();

    // field list view - metabase#55618
    const targets = page.getByPlaceholder("Select a target", { exact: true });
    await expect(targets).toHaveCount(2);
    await expect(targets.nth(0)).toHaveValue("People → ID");
    await expect(targets.nth(1)).toHaveValue("Products → ID");
    await targets.nth(0).click();
    await expect(
      popover(page).getByText("Orders → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("People → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Products → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Reviews → ID", { exact: true }),
    ).toBeVisible();
    await popover(page).getByText("Reviews → ID", { exact: true }).click();
    await expect(targets.nth(0)).toHaveValue("Reviews → ID");

    // field list view - metabase#55617
    const semanticTypes = page.getByPlaceholder("Select a semantic type", {
      exact: true,
    });
    await expect(semanticTypes.nth(6)).toHaveValue("Discount");
    await semanticTypes.nth(6).click();
    await popover(page).getByText("No semantic type", { exact: true }).click();
    await expect(semanticTypes.nth(6)).toHaveValue("No semantic type");

    // field detail view
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("link", { name: /User ID/ }).click();

    // field detail view - metabase#55618
    await expect(editButton).toBeVisible();
    await editButton.click();
    const target = page.getByPlaceholder("Select a target", { exact: true });
    await expect(target).toHaveValue("People → ID");
    await target.click();
    await expect(
      popover(page).getByText("Orders → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("People → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Products → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Reviews → ID", { exact: true }),
    ).toBeVisible();
    await popover(page).getByText("Reviews → ID", { exact: true }).click();
    await expect(target).toHaveValue("Reviews → ID");

    // field detail view - metabase#55617
    const semanticType = page.getByPlaceholder("Select a semantic type", {
      exact: true,
    });
    await expect(semanticType).toHaveValue("Foreign Key");
    await semanticType.click();
    await popover(page).getByText("No semantic type", { exact: true }).click();
    await expect(semanticType).toHaveValue("No semantic type");
  });

  test("should allow changing field's FK target mapping in segments field list view and segment field detail view (metabase#55617, metabase#55618)", async ({
    page,
  }) => {
    const getSegments = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/segment",
    );
    await page.goto("/reference/segments");
    await getSegments;

    await page.getByRole("link", { name: /My segment/ }).click();
    await page.getByRole("link", { name: /Fields in this segment/ }).click();

    // field list view
    const editButton = page.getByRole("button", { name: /Edit/ });
    await expect(editButton).toBeVisible();
    await editButton.click();

    // field list view (metabase#55618)
    const targets = page.getByPlaceholder("Select a target", { exact: true });
    await expect(targets).toHaveCount(2);
    await expect(targets.nth(0)).toHaveValue("People → ID");
    await expect(targets.nth(1)).toHaveValue("Products → ID");
    await targets.nth(0).click();
    await expect(
      popover(page).getByText("Orders → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("People → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Products → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Reviews → ID", { exact: true }),
    ).toBeVisible();
    await popover(page).getByText("Reviews → ID", { exact: true }).click();
    await expect(targets.nth(0)).toHaveValue("Reviews → ID");

    // field list view (metabase#55617)
    const semanticTypes = page.getByPlaceholder("Select a semantic type", {
      exact: true,
    });
    await expect(semanticTypes.nth(6)).toHaveValue("Discount");
    await semanticTypes.nth(6).click();
    await popover(page).getByText("No semantic type", { exact: true }).click();
    await expect(semanticTypes.nth(6)).toHaveValue("No semantic type");

    // field detail view
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("link", { name: /User ID/ }).click();

    // field detail view (metabase#55618)
    await expect(editButton).toBeVisible();
    await editButton.click();
    const target = page.getByPlaceholder("Select a target", { exact: true });
    await expect(target).toHaveValue("People → ID");
    await target.click();
    // scroll to bottom so the popover drops up
    await main(page).evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    // NOTE: these four are `should("exist")` upstream, not `be.visible` —
    // ported as presence (toHaveCount(1)), which is what the scroll-to-bottom
    // dance is there to work around.
    await expect(
      popover(page).getByText("Orders → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      popover(page).getByText("People → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      popover(page).getByText("Products → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      popover(page).getByText("Reviews → ID", { exact: true }),
    ).toHaveCount(1);
    await popover(page).getByText("Reviews → ID", { exact: true }).click();
    await expect(target).toHaveValue("Reviews → ID");

    // field detail view (metabase#55617)
    const semanticType = page.getByPlaceholder("Select a semantic type", {
      exact: true,
    });
    await expect(semanticType).toHaveValue("Foreign Key");
    await semanticType.click();
    await popover(page).getByText("No semantic type", { exact: true }).click();
    await expect(semanticType).toHaveValue("No semantic type");
  });
});

test.describe("issue 55619", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow you to change the currency where you can set a semantic type (metabase#55619)", async ({
    page,
    mb,
  }) => {
    // set a non-default value
    await mb.api.put(`/api/field/${ORDERS.DISCOUNT}`, {
      settings: { currency: "CAD" },
    });

    // data reference - field list
    await page.goto(
      `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields`,
    );
    await main(page).getByRole("button", { name: /Edit/ }).click();
    await (await findByDisplayValue(main(page), "Canadian Dollar")).click();
    await popover(page).getByText("Euro", { exact: true }).click();
    await expect(await findByDisplayValue(main(page), "Euro")).toBeVisible();
    await main(page).getByRole("button", { name: /Save/ }).click();
    await expect(main(page).getByRole("button", { name: /Edit/ })).toBeVisible();

    // data reference - field details
    await main(page).getByRole("link", { name: /Discount/ }).click();
    await main(page).getByRole("button", { name: /Edit/ }).click();
    await (await findByDisplayValue(main(page), "Euro")).click();
    await popover(page).getByText("Australian Dollar", { exact: true }).click();
    await expect(
      await findByDisplayValue(main(page), "Australian Dollar"),
    ).toBeVisible();
    await main(page).getByRole("button", { name: /Save/ }).click();
    await expect(main(page).getByRole("button", { name: /Edit/ })).toBeVisible();

    // model metadata
    await navigationSidebar(page).getByText("Models", { exact: true }).click();
    await main(page).getByLabel("Create a new model", { exact: true }).click();
    await main(page)
      .getByText("Use the notebook editor", { exact: true })
      .click();
    await miniPicker(page)
      .getByText("Sample Database", { exact: true })
      .click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await runButtonOverlay(page).click();
    await expect(tableInteractive(page)).toContainText("37.65");

    await page.getByTestId("editor-tabs-columns-name").click();
    await openColumnOptions(page, "Discount");
    const sidebar = page.getByTestId("sidebar-content");
    await (await findByDisplayValue(sidebar, "Australian Dollar")).click();
    await popover(page).getByText("Euro", { exact: true }).click();
    await expect(await findByDisplayValue(sidebar, "Euro")).toBeVisible();

    await datasetEditBar(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    // wait for modal to disappear
    await expect(modal(page)).toHaveCount(0);
    // wait for qb to turn into view-mode
    await expect(
      queryBuilderHeader(page).getByText("Orders", { exact: true }),
    ).toBeVisible();
    // wait for query to complete
    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    await expect(
      page
        .getByTestId("table-header")
        .getByTestId("header-cell")
        .filter({ hasText: /^Discount \(€\)$/ }),
    ).toBeVisible();
  });
});

/**
 * Count of form controls whose current value is `value` — the existence side
 * of `cy.findByDisplayValue` (Playwright has no getByDisplayValue).
 */
async function countDisplayValue(page: Page, value: string): Promise<number> {
  const controls = page.locator("input, textarea, select");
  const count = await controls.count();
  let matches = 0;
  for (let index = 0; index < count; index++) {
    if ((await controls.nth(index).inputValue()) === value) {
      matches += 1;
    }
  }
  return matches;
}
