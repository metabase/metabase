/**
 * Playwright port of
 * e2e/test/scenarios/permissions/permissions-reproductions.cy.spec.**js**
 *
 * 🔴 SOURCE DISAMBIGUATION — the upstream `permissions/` directory holds a
 * DISJOINT SIBLING PAIR differing only in extension:
 *
 *   permissions-reproductions.cy.spec.ts  → issues 11994, 39221, 76710
 *       already ported → tests/permissions-reproductions.spec.ts (committed)
 *   permissions-reproductions.cy.spec.js  → issues 13347, 14873, 17777, 19603,
 *       20436, 22447/22449/22450, 22473, 22695, 22726, 22727, 23981, 24966
 *       THIS FILE
 *
 * They share no issue numbers. The obvious target name was already taken by the
 * `.ts` sibling, so this port is `-js`-suffixed (matching the existing
 * `support/native-reproductions-js.ts` precedent) and its helper module is
 * `support/permissions-reproductions-js.ts`. Nothing was overwritten.
 *
 * FIXTURE IDS — every one read from source, never guessed (PORTING's
 * DATA_ANALYSTS_GROUP trap):
 *   ALL_USERS_GROUP  = 1  ┐ e2e/support/cypress_data.js:42-49 (USER_GROUPS).
 *   COLLECTION_GROUP = 5  │ Note 4 is DATA_ANALYSTS_GROUP and lives in the
 *   DATA_GROUP       = 6  ┘ separate MAGIC_USER_GROUPS map — not used here.
 *   PG_DB_ID = 2 is the spec's own literal; under the `postgres-12` snapshot
 *   database 2 is the read-only QA Postgres12 sample, NOT the writable
 *   container, so FINDINGS #85 contamination does not apply.
 *   nocollection = "No Collection Tableton", nodata = "No Data Tableton"
 *   (cypress_data.js USERS). Sandboxed user u1 carries attr_uid "1" /
 *   attr_cat "Widget"; issue 24966 gives nodata attr_cat "Gizmo".
 *
 * INFRA TIERS (see findings-inbox for the executed-vs-skipped control):
 *   - 13347 (2 tests): upstream `@skip` + `@external` → ported as skipped.
 *   - 17777 (1 test):  upstream `@skip` → ported as skipped.
 *   - 14873 (1 test):  `@external` (postgres-12) + token (`sandboxes`).
 *   - 20436, 22449-block, 22695, 24966: token (`advanced_permissions` /
 *     `sandboxes`); `pro-self-hosted` carries both (probed: 42 features).
 *   - 22473 (1 test):  email — needs the maildev container.
 *   - the rest run on the bare jar.
 *
 * PORT NOTES
 * - `cy.updatePermissionsGraph` / `cy.updateCollectionGraph` → the shared
 *   GET-merge-PUT API ports (dashboard-repros / click-behavior).
 * - `cy.signIn("nocollection")` and `cy.signIn("none")` use
 *   `signInWithCachedSession` — neither user is in the typed USERS map. It sets
 *   BROWSER cookies only, so `mb.api` keeps whatever session `mb.signIn` last
 *   set; every test that does this afterwards touches the UI only.
 * - Two upstream assertions are recorded as vacuous and ported VERBATIM rather
 *   than silently strengthened (see issue 22727 for the analysis).
 * - `H.assertDatasetReqIsSandboxed({ requestAlias })` is called with NO column
 *   options at both call sites here, so upstream is already in the degraded
 *   `is_sandboxed`-only mode described in FINDINGS #87 — the QP self-reporting
 *   that a sandbox ran, not that data was filtered. Ported faithfully; both
 *   call sites are backed up by an independent row-count/value observation, so
 *   the restriction itself is genuinely observed here.
 */
import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { getFullName } from "../support/admin-people";
import { leftSidebar } from "../support/charts";
import { updateCollectionGraph } from "../support/click-behavior";
import { archiveCollection } from "../support/collections-trash";
import { filterWidget, sidebar } from "../support/dashboard";
import { COLLECTION_GROUP, DATA_GROUP } from "../support/admin-permissions";
import {
  ALL_USERS_GROUP,
  sandboxTable,
  updatePermissionsGraph,
} from "../support/dashboard-repros";
import { entityPickerModal } from "../support/entity-picker";
import {
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { queryBuilderFooter } from "../support/filter-bulk";
import { commandPaletteSearch } from "../support/metrics-search";
import { openQuestionActions } from "../support/models";
import { assertQueryBuilderRowCount } from "../support/notebook";
import { assertDatasetReqIsSandboxed } from "../support/notebook-link-to-data-source";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import { openDashboardMenu } from "../support/organization";
import { signInWithCachedSession, visitQuestionAdhoc } from "../support/permissions";
import {
  isCardQueryResponse,
  isDashcardQueryResponse,
} from "../support/sandboxing-via-api";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { icon, modal, newButton, popover, visitDashboard, visitQuestion } from "../support/ui";

import {
  MAILDEV_SKIP_REASON,
  NODATA_USER_ID,
  PG_DB_ID,
  POSTGRES_SKIP_REASON,
  TOKEN_SKIP_REASON,
  assertSearchResultsExcludeSampleDatabase,
  changePermissions,
  hideTables,
  isCreateCardResponse,
  isDatasetResponse,
  isPermissionsGraphPut,
  saveChanges,
  withDatabase,
} from "../support/permissions-reproductions-js";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID, PRODUCTS } =
  SAMPLE_DATABASE;

/**
 * cypress_data.js USERS.nocollection — the first/last name pair `H.getFullName`
 * formats. Read from source, not guessed.
 */
const NOCOLLECTION = { first_name: "No Collection", last_name: "Tableton" };

// NOTE: This issue wasn't specifically related to PostgreSQL. We simply needed
// to add another DB to reproduce it.
//
// Upstream carries `tags: ["@external", "@skip"]`. The `@skip` is honoured
// (PORTING: upstream @skips port as skips — do not silently enable them), so
// this whole describe is skipped regardless of PW_QA_DB_ENABLED. The body is
// ported faithfully so it can be re-enabled without a rewrite.
test.describe.skip("issue 13347 [upstream @skip + @external]", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        1: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
        [PG_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    });

    await updateCollectionGraph(mb.api, {
      [ALL_USERS_GROUP]: { root: "read" },
    });

    const { tableIds } = await withDatabase(mb.api, PG_DB_ID);
    await createQuestion(mb.api, {
      name: "Q1",
      query: { "source-table": tableIds.ORDERS_ID },
      database: PG_DB_ID,
    });
    await createNativeQuestion(mb.api, {
      name: "Q2",
      native: { query: "SELECT * FROM ORDERS" },
      database: PG_DB_ID,
    });
  });

  for (const variant of ["QB", "Native"] as const) {
    test(`${variant.toUpperCase()} version:\n should be able to select question (from "Saved Questions") which belongs to the database user doesn't have data-permissions for (metabase#13347)`, async ({
      page,
      context,
    }) => {
      await signInWithCachedSession(context, "none");

      const dataset = page.waitForResponse(isDatasetResponse);

      await page.goto("/question/notebook");
      await page.getByText("Saved Questions", { exact: true }).click();
      await page
        .getByText(variant === "QB" ? "Q1" : "Q2", { exact: true })
        .click();

      await dataset;
      // cy.contains is a case-sensitive substring match.
      await expect(page.getByText(/37\.65/).first()).toBeVisible();
    });
  }
});

test.describe("postgres > user > query [@external]", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, POSTGRES_SKIP_REASON);
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    // Update basic permissions (the same starting "state" as we have for the
    // "Sample Database")
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [PG_DB_ID]: { "view-data": "blocked", "create-queries": "no" },
      },
      [DATA_GROUP]: {
        [PG_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
      [COLLECTION_GROUP]: {
        [PG_DB_ID]: { "view-data": "blocked", "create-queries": "no" },
      },
    });
  });

  test("should handle the use of `regexExtract` in a sandboxed table (metabase#14873)", async ({
    page,
    mb,
  }) => {
    const CC_NAME = "Firstname";
    // We need ultra-wide screen to avoid scrolling (custom column is rendered
    // at the last position)
    await page.setViewportSize({ width: 2200, height: 1200 });

    const { tableIds, fields } = await withDatabase(mb.api, PG_DB_ID);
    const peopleId = tableIds.PEOPLE_ID;

    // Question with a custom column created with `regextract`
    const question = await createQuestion(mb.api, {
      name: "14873",
      query: {
        "source-table": peopleId,
        expressions: {
          [CC_NAME]: [
            "regex-match-first",
            ["field-id", fields.PEOPLE.NAME],
            "^[A-Za-z]+",
          ],
        },
      },
      database: PG_DB_ID,
    });

    await sandboxTable(mb.api, {
      table_id: peopleId,
      attribute_remappings: {
        attr_uid: ["dimension", ["field-id", fields.PEOPLE.ID]],
      },
    });

    await mb.signOut();
    await mb.signInAsSandboxedUser();

    const cardQuery = page.waitForResponse((response) =>
      isCardQueryResponse(response, question.id),
    );
    await page.goto(`/question/${question.id}`);
    const cardQueryResponse = await cardQuery;

    await expect(page.getByText(CC_NAME, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Hudson$/).first()).toBeVisible();
    // test that user is sandboxed - normal users has over 2000 rows
    await assertQueryBuilderRowCount(page, 1);
    await assertDatasetReqIsSandboxed(cardQueryResponse);
  });
});

// Upstream carries `tags: "@skip"`; honoured rather than silently enabled.
test.describe.skip("issue 17777 [upstream @skip]", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await hideTables(mb.api, [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID]);
  });

  test("should still be able to set permissions on individual tables, even though they are hidden in data model (metabase#17777)", async ({
    page,
  }) => {
    await page.goto(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    await expect(
      page.getByText("Permissions for the All Users group", { exact: true }),
    ).toBeVisible();
    await page.getByText("Sample Database", { exact: true }).first().click();

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
      );

    const permissionTable = page.getByTestId("permission-table");
    for (const name of ["Orders", "Products", "Reviews", "People"]) {
      await expect(
        permissionTable.getByText(name, { exact: true }).first(),
      ).toBeVisible();
    }

    await page.getByText("No self-service", { exact: true }).first().click();

    await expect(popover(page).getByText(/Unrestricted/).first()).toBeVisible();
  });
});

test.describe("issue 19603", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Archive second collection (nested under the first one)
    const collections = (await (
      await mb.api.get("/api/collection/")
    ).json()) as { id: number; slug: string }[];
    const second = collections.find((c) => c.slug === "second_collection");
    if (!second) {
      throw new Error("second_collection not found in the default snapshot");
    }
    await archiveCollection(mb.api, second.id);
  });

  test("archived subcollection should not show up in permissions (metabase#19603)", async ({
    page,
  }) => {
    await page.goto("/admin/permissions/collections");

    await page.getByText("First collection", { exact: true }).click();
    await expect(
      page.getByText("Second collection", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 20436", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  const url = `/admin/permissions/data/group/${ALL_USERS_GROUP}`;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        1: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });
  });

  test("should display correct permissions on the database level after changes on the table level (metabase#20436)", async ({
    page,
  }) => {
    await page.goto(url);

    await page
      .getByTestId("permission-table")
      .getByText("Query builder only", { exact: true })
      .click();

    await popover(page).getByText("Granular", { exact: true }).click();

    // Change the permission levels for ANY of the tables - it doesn't matter
    // which one
    let updated = page.waitForResponse(isPermissionsGraphPut);
    await changePermissions(page, "Query builder only", "No");
    await saveChanges(page);
    await updated;

    // Now turn it back to previous value
    updated = page.waitForResponse(isPermissionsGraphPut);
    await changePermissions(page, "No", "Query builder only");
    await saveChanges(page);
    await updated;

    await page.goto(url);
    await expect(
      page.getByText("Query builder only", { exact: true }).first(),
    ).toBeVisible();
  });
});

test.describe("UI elements that make no sense for users without data permissions (metabase#22447, metabase#22449, metabase#22450)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test("should not offer to save question to users with no data permissions", async ({
    page,
    mb,
  }) => {
    await mb.signIn("nodata");

    await visitQuestion(page, ORDERS_QUESTION_ID);

    // Bare `cy.findByTestId(...)` is an implicit existence assertion.
    await expect(page.getByTestId("viz-settings-button")).toBeVisible();
    // The view-footer "Visualization" button is the CHART-TYPE control, not the
    // disabled QuestionDisplayToggle — a plain click is correct here (PORTING
    // explicitly scopes the force-click rule away from this element).
    await page.getByText("Visualization", { exact: true }).click();

    await expect(page.getByTestId("display-options-sensible")).toBeVisible();

    const sidebarScope = leftSidebar(page);
    await sidebarScope.getByTestId("more-charts-toggle").click();
    await icon(sidebarScope, "line").click();
    // The gear is `opacity: 0` until `.VisualizationButton:hover` or its own
    // hover (ChartTypeOption.module.css), so the realHover is load-bearing.
    // Playwright's click then moves the cursor onto the gear, which satisfies
    // `.SettingsButton:hover` and keeps it shown.
    await sidebarScope.getByTestId("Line-button").hover();
    await icon(sidebarScope.getByTestId("Line-container"), "gear").click();

    await expect(
      page.getByText("Line options", { exact: true }).first(),
    ).toBeVisible();

    // Upstream: should("have.attr", "data-disabled") — one-arg, i.e. presence.
    const saveButton = page.getByTestId("qb-save-button");
    await expect(saveButton).toHaveAttribute("data-disabled");

    await saveButton.hover();
    await expect(
      page
        .getByText("You don't have permission to save this question.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();

    await expect(
      icon(page.getByTestId("qb-header-action-panel"), "refresh"),
    ).toHaveCount(0);

    await newButton(page).click();
    // `should("contain", x)` is chai-jquery's ANY-OF form on a multi-element
    // subject; `.and("not.contain", "Question")` is "no matched element
    // contains it". cy.contains is case-SENSITIVE, hence the regexes.
    await expect(popover(page).filter({ hasText: /Dashboard/ })).not.toHaveCount(
      0,
    );
    await expect(popover(page).filter({ hasText: /Question/ })).toHaveCount(0);
  });

  test("should not show visualization or question settings to users with block data permissions", async ({
    page,
    mb,
  }) => {
    test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
    });

    await mb.signIn("nodata");

    // Not visitQuestion(): the card query answers 4xx for a blocked user and
    // the QB renders the permission error instead of results.
    await page.goto(`/question/${ORDERS_QUESTION_ID}`);

    await expect(
      page
        .getByText("Sorry, you don't have permission to run this query.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();

    // `H.queryBuilderFooter().findByTestId(...)` carries an implicit existence
    // requirement on the footer itself (Cypress errors on a missing subject) —
    // ported as its own anchor so the absence checks below stay honest.
    const footer = queryBuilderFooter(page);
    await expect(footer).toBeVisible();
    await expect(footer.getByTestId("viz-settings-button")).toHaveCount(0);
    await expect(
      footer.getByText("Visualization", { exact: true }),
    ).toHaveCount(0);

    await expect(
      icon(page.getByTestId("qb-header-action-panel"), "refresh"),
    ).toHaveCount(0);

    await newButton(page).click();
    await expect(popover(page).filter({ hasText: /Dashboard/ })).not.toHaveCount(
      0,
    );
    await expect(popover(page).filter({ hasText: /Question/ })).toHaveCount(0);
  });
});

test.describe("issue 22473", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!(await isMaildevRunning()), MAILDEV_SKIP_REASON);
    await mb.restore();
    await mb.signInAsAdmin();
    await setupSMTP(mb.api);
  });

  test("nocollection user should be able to view and unsubscribe themselves from a subscription", async ({
    page,
    context,
  }) => {
    await page.goto(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    await openDashboardMenu(page, "Subscriptions");
    await page.getByText("Email it", { exact: true }).click();

    // 🔴 RecipientPicker only sets its placeholder while recipients.length === 0
    // (PORTING: the single biggest cause of run-1 failures). A Locator is LAZY —
    // holding it in a variable re-resolves on every use and is NOT enough; the
    // placeholder is gone the moment the first pill commits, so `.blur()` on it
    // times out (measured here on run 1). Take an ElementHandle, which is bound
    // to the node, so the blur reaches the element Cypress actually typed into.
    const recipients = page.getByPlaceholder(
      "Enter user names or email addresses",
    );
    await recipients.click();
    const recipientsHandle = await recipients.elementHandle();
    if (!recipientsHandle) {
      throw new Error("RecipientPicker input not found");
    }
    await recipients.pressSequentially(
      `${NOCOLLECTION.first_name} ${NOCOLLECTION.last_name}`,
    );
    await recipients.press("Enter");
    // Explicit blur before the submit: a Playwright mousedown on "Done" would
    // otherwise blur the PillsInput, re-render the form, and deliver no click.
    await recipientsHandle.evaluate((element: HTMLElement) =>
      element.blur(),
    );

    await sidebar(page).getByRole("button", { name: "Done", exact: true }).click();

    await signInWithCachedSession(context, "nocollection");
    await page.goto("/account/notifications");

    await expect(
      page.getByText("Orders in a dashboard", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByTestId("notifications-list")
      .getByLabel("close icon", { exact: true })
      .click();
    await modal(page)
      .getByRole("button", { name: "Unsubscribe", exact: true })
      .click();

    // 🔴 NotificationList renders `notifications-list` ONLY when
    // listItems.length > 0, and its empty state renders PRE-FETCH too — the
    // measured trap from PORTING (bell at +68ms, real card at +134ms). Anchor
    // on the list container disappearing before asserting the text is gone, so
    // this cannot pass on an unrendered page.
    await expect(page.getByTestId("notifications-list")).toHaveCount(0);
    await expect(
      page.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 22695 ", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
      [DATA_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
    });
  });

  // https://github.com/metabase/metaboat/issues/159
  test("should not expose database names to which the user has no access permissions (metabase#22695)", async ({
    page,
    context,
    mb,
  }) => {
    // Nocollection user belongs to a "data" group which we blocked for this
    // repro, but they have access to data otherwise (as name suggests)
    await signInWithCachedSession(context, "nocollection");
    await page.goto("/");
    await commandPaletteSearch(page, "S");
    await assertSearchResultsExcludeSampleDatabase(page);

    await mb.signOut();

    // Nodata user belongs to the group that has access to collections,
    // but has no-self-service data permissions
    await mb.signIn("nodata");
    await page.goto("/");
    await commandPaletteSearch(page, "S");
    await assertSearchResultsExcludeSampleDatabase(page);
  });
});

test.describe("issue 22726", () => {
  test.beforeEach(async ({ mb, context }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Let's give all users a read only access to "Our analytics"
    await updateCollectionGraph(mb.api, {
      [ALL_USERS_GROUP]: { root: "read" },
    });

    await signInWithCachedSession(context, "nocollection");
  });

  test("should offer to duplicate a question in a view-only collection (metabase#22726)", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await openQuestionActions(page);
    await popover(page).getByText("Duplicate", { exact: true }).click();
    await expect(
      page
        .getByText(`${getFullName(NOCOLLECTION)}'s Personal Collection`, {
          exact: true,
        })
        .first(),
    ).toBeVisible();

    const created = page.waitForResponse(isCreateCardResponse);
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await created;
  });
});

test.describe("issue 22727", () => {
  test.beforeEach(async ({ mb, context }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Let's give all users a read only access to "Our analytics"
    await updateCollectionGraph(mb.api, {
      [ALL_USERS_GROUP]: { root: "read" },
    });

    await signInWithCachedSession(context, "nocollection");
  });

  test("should not offer to save question in view only collection (metabase#22727, metabase#20717)", async ({
    page,
  }) => {
    // It is important to start from a saved question and to alter it.
    // We already have a reproduction that makes sure "Our analytics" is not
    // offered when starting from an ad-hoc question (table).
    await visitQuestion(page, ORDERS_QUESTION_ID);

    const dataset = page.waitForResponse(isDatasetResponse);
    await page.getByText("31.44", { exact: true }).click();
    await popover(page).getByText(/=/).first().click();
    await dataset;

    await page.getByText("Save", { exact: true }).click();

    const saveModal = page.getByTestId("save-question-modal");
    await expect(saveModal).toBeVisible();

    // ── Two upstream quirks, ported VERBATIM with the analysis inline ──
    //
    // (1) `cy.findByText(/^Replace original qeustion/)` — "qeustion" is a TYPO
    //     upstream, so this absence assertion CANNOT FAIL and the
    //     metabase#20717 half of this test asserts nothing.
    //
    //     MEASURED, not inferred (the "can this locator ever match?" probe):
    //     re-running this exact flow as ADMIN — a user who genuinely IS
    //     offered the replace option — counted
    //         typo-spelling matches = 0,  correct-spelling matches = 1.
    //     So the typo'd locator matches nothing even in the state that is
    //     supposed to trigger it, while the corrected locator demonstrably
    //     can match. The behaviour upstream MEANT to check is in fact correct
    //     today (the view-only user is not offered it), so fixing the typo
    //     would keep the test green AND make it load-bearing — but as written
    //     a regression here would go undetected.
    //
    //     Identical semantics in Cypress, so this is an upstream hole, not
    //     port drift. Kept as-is rather than "fixed": silently repairing a
    //     disabled assertion in a port would hide that it was ever disabled.
    //     (Recorded in findings-inbox.)
    // (2) The upstream `.then((modal) => { ... })` callback DISCARDS its
    //     `modal` argument and issues UNSCOPED `cy.findByText` queries, so
    //     both run against the whole document, not the modal. Ported
    //     page-wide to match what actually executes.
    await expect(page.getByText(/^Replace original qeustion/)).toHaveCount(0);

    // This part is an actual repro for metabase#22727.
    // `.invoke("text")` reads raw textContent — do NOT use toHaveText here,
    // which normalizes whitespace (PORTING).
    const whereLabel = page.getByLabel(/Where do you want to save this/);
    await expect(whereLabel).toBeVisible();
    expect(await whereLabel.textContent()).not.toBe("Our analytics");
  });
});

test.describe("issue 23981", () => {
  test.beforeEach(async ({ mb, context }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Let's revoke access to "Our analytics" from "All users"
    await updateCollectionGraph(mb.api, {
      [ALL_USERS_GROUP]: { root: "none" },
    });

    await signInWithCachedSession(context, "nocollection");
  });

  test("should not show the root collection name in breadcrumbs if the user does not have access to it (metabase#23981)", async ({
    page,
  }) => {
    // Assigned to a variable rather than inlined so TypeScript's
    // excess-property check does not reject upstream's `name` key, which
    // `AdhocQuestion` does not declare. Keeping it preserves the hash payload
    // byte-for-byte.
    const adhocQuestion = {
      name: "23981",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query" as const,
        query: { "source-table": PEOPLE_ID },
      },
    };
    await visitQuestionAdhoc(page, adhocQuestion);

    await page.getByText("Save", { exact: true }).click();
    await page
      .getByText(`${getFullName(NOCOLLECTION)}'s Personal Collection`, {
        exact: true,
      })
      .click();

    const picker = entityPickerModal(page);
    await expect(picker).toBeVisible();
    await expect(picker.getByText("Our analytics", { exact: true })).toHaveCount(
      0,
    );
    // ensure that "Collections" is not selectable
    const collections = picker.getByText("Collections", { exact: true });
    await expect(collections).toBeVisible();
    await collections.click();
    await expect(
      picker.getByRole("button", { name: "Select this collection", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issue 24966", () => {
  test.skip(!resolveToken("pro-self-hosted"), TOKEN_SKIP_REASON);

  const sandboxingQuestion = {
    name: "geadsfasd",
    native: {
      query:
        "select products.category,PRODUCTS.title from PRODUCTS where true [[AND products.CATEGORY = {{category}}]]",
      "template-tags": {
        category: {
          id: "411b40bb-1374-9787-6ffb-20604df56d73",
          name: "category",
          "display-name": "Category",
          type: "text",
        },
      },
    },
    parameters: [
      {
        id: "411b40bb-1374-9787-6ffb-20604df56d73",
        type: "category",
        target: ["variable", ["template-tag", "category"]],
        name: "Category",
        slug: "category",
      },
    ],
  };

  const dashboardFilter = {
    name: "Text",
    slug: "text",
    id: "ec00b255",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [dashboardFilter] };

  let dashboardId: number;
  let dashcardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // H.blockUserGroupPermissions(ALL_USERS_GROUP) — inlined rather than
    // imported so this spec does not depend on a second permissions module.
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked", "create-queries": "no" },
      },
    });

    // Add user attribute to existing user
    await mb.api.put(`/api/user/${NODATA_USER_ID}`, {
      login_attributes: { attr_cat: "Gizmo" },
    });

    const sandboxSource = await createNativeQuestion(mb.api, sandboxingQuestion);
    await sandboxTable(mb.api, {
      table_id: PRODUCTS_ID,
      card_id: sandboxSource.id,
      attribute_remappings: {
        attr_cat: ["variable", ["template-tag", "category"]],
      },
    });

    // Add the saved products table to the dashboard
    const result = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        query: { "source-table": PRODUCTS_ID, limit: 10 },
      },
      dashboardDetails,
    });
    dashboardId = result.dashboard_id;
    dashcardId = result.id;

    // Connect the filter to the card
    await mb.api.put(`/api/dashboard/${result.dashboard_id}`, {
      dashcards: [
        {
          id: result.id,
          card_id: result.card_id,
          col: 0,
          row: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: dashboardFilter.id,
              card_id: result.card_id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
        },
      ],
    });
  });

  test("should correctly fetch field values for a filter when native question is used for sandboxing (metabase#24966)", async ({
    page,
    mb,
  }) => {
    await mb.signIn("nodata");
    await visitDashboard(page, mb.api, dashboardId);
    await filterWidget(page).click();
    await page.getByLabel("Gizmo", { exact: true }).click();
    await page.getByRole("button", { name: "Add filter", exact: true }).click();
    await expect.poll(() => new URL(page.url()).search).toBe("?text=Gizmo");

    await mb.signInAsSandboxedUser();

    await visitDashboard(page, mb.api, dashboardId);
    await filterWidget(page).click();
    await page.getByLabel("Widget", { exact: true }).click();

    // Upstream reads `cy.get("@dashcardQuery<id>")` at the very end, and a
    // Cypress alias holds the LAST matching response — which, after "Add
    // filter", is the FILTERED dashcard query, not the one fired on load.
    // Register the wait immediately before the click that fires it.
    //
    // Registering it before `visitDashboard` instead (as run 1 did) captures
    // the on-load query and then fails with "No resource with given
    // identifier found": Chromium evicts a response body once enough
    // navigation/network has happened after it. Read the body promptly.
    const dashcardQuery = page.waitForResponse((response) =>
      isDashcardQueryResponse(response, dashcardId),
    );
    await page.getByRole("button", { name: "Add filter", exact: true }).click();
    const dashcardResponse = await dashcardQuery;
    const sandboxAssertion = assertDatasetReqIsSandboxed(dashcardResponse);

    await expect.poll(() => new URL(page.url()).search).toBe("?text=Widget");
    await sandboxAssertion;
  });
});
