/**
 * Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-1.cy.spec.js
 *
 * 13 independent question-builder regression guards across 13 describes,
 * matching the source's 13 `it()` blocks 1:1. The repetition IS the coverage —
 * nothing here is merged or consolidated.
 *
 * (An earlier version of this header said "12 across 10 describes". That was a
 * prose undercount only — it omitted one of the two `17514` scenarios and
 * counted top-level describes only. The code was always 1:1; verified by
 * counting `test(` against `it(` in the source.)
 *
 * NOTE on the target filename: the source directory holds
 * `reproductions.cy.spec.**ts**` alongside `reproductions-1/-2/-3/-4.cy.spec.**js**`,
 * and all four of the others have already landed
 * (`tests/question-reproductions{,-2,-3,-4}.spec.ts`). There is no
 * `reproductions-1.cy.spec.ts` twin of this `.js` source and no pre-existing
 * `tests/question-reproductions-1.spec.ts`. The support module keeps the
 * matching name, `support/question-reproductions-1.ts` — no deviation.
 *
 * Infra tier: **@external (QA Postgres) for 3 of 13 describes**, none for the
 * rest.
 * - `issue 14957`, `postgres > question > custom columns` (15714) and
 *   `issue 15876` all `H.restore("postgres-12")` and drive database 2. Their
 *   `@external` tags are accurate; gated on PW_QA_DB_ENABLED.
 * - The 15714 describe reads `/api/database/${WRITABLE_DB_ID}/schema/public`,
 *   but `WRITABLE_DB_ID` is just the literal `2` and under the **postgres-12**
 *   snapshot database 2 is the read-only "QA Postgres12" sample, not
 *   `writable_db`. So this spec makes **no contact with the shared writable
 *   container** and the #85 debris/virtualization hazards do not apply.
 *   (Verified at runtime — see findings.)
 * - Every other describe runs entirely on the H2 sample database. No mongo, no
 *   mysql, no maildev, no webhook-tester, no snowplow, no EE token.
 *
 * Porting notes:
 * - `cy.intercept(...).as(x)` + `cy.wait("@x")` → `waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2).
 * - `findByText(string)` / `findByLabelText(string)` are EXACT
 *   testing-library matches → `{ exact: true }`; `cy.button(name)` →
 *   `getByRole("button", { name, exact: true })`; `cy.icon(name)` →
 *   `.Icon-<name>`; `cy.contains(str)` → case-sensitive substring regex +
 *   `.first()`.
 * - `H.CustomExpressionEditor.focus()` is `click("right", {force:true})` and
 *   the force is load-bearing, so this port uses a dispatch-based focus
 *   (`focusCustomExpressionEditorForced` in the support module) rather than
 *   the shared real-click `focusCustomExpressionEditor`.
 * - `click({ force: true })` in the source is ported as `dispatchEvent("click")`,
 *   which is what Cypress's `{force:true}` actually does.
 * - `issue 19893`'s two tests are tagged `@skip` upstream (they never run in
 *   CI) — ported in full and skipped with that reason rather than dropped.
 * - Spec-local helpers live in support/question-reproductions-1.ts.
 */
import { expect, test } from "../support/fixtures";
import { openOrdersTable } from "../support/ad-hoc-question";
import { leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { openVizTypeSidebar } from "../support/charts-extras";
import { commandPalette } from "../support/command-palette";
import { formatExpression } from "../support/custom-column-3";
import {
  editDashboard,
  filterWidget,
  saveDashboard,
} from "../support/dashboard";
import { showDashboardCardActions } from "../support/dashboard-cards";
import { mockSessionProperty } from "../support/admin-extras";
import {
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import {
  commandPaletteSearch,
  editDashboardCard,
  goToMainApp,
} from "../support/filters-repros";
import { join, miniPickerBrowseAll, summarizeNotebook } from "../support/joins";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import { tablePickerTable } from "../support/question-saved";
import { questionInfoButton, sidesheet } from "../support/revisions";
import { saveQuestion } from "../support/sharing";
import { goToAdmin } from "../support/command-palette";
import { ORDERS_QUESTION_ID, SAMPLE_DATABASE } from "../support/sample-data";
import {
  appBar,
  icon,
  modal,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import { moveDnDKitElementVertically } from "../support/viz-charts-repros";
import {
  QA_DB_SKIP_REASON,
  assertNoOpenPopover,
  enterCustomColumnDetailsForced,
  openEllipsisMenuFor,
  openTableNotebookInDatabase,
  setAdHocFilterTimeBucket,
  typeCustomExpressionForced,
  typeExpressionName,
  waitForCardQuery,
  waitForCreateCard,
  waitForDashcardQuery,
  waitForDataset,
  waitForSearch,
  waitForUpdateCard,
  waitForUpdateTable,
} from "../support/question-reproductions-1";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const QUESTION_NAME = "Foo";

/** Port of WRITABLE_DB_ID (e2e/support/cypress_data.js:209). */
const WRITABLE_DB_ID = 2;

test.describe("issue 6239", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await openOrdersTable(page, { mode: "notebook" });

    await summarizeNotebook(page);
    await page.getByText("Custom Expression", { exact: true }).click();

    await typeCustomExpressionForced(page, "CountIf([Total] > 0)");
    await formatExpression(page);

    await typeExpressionName(page, "CE");
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // cy.findByTestId("aggregate-step").contains("CE").should("exist")
    await expect(
      page.getByTestId("aggregate-step").getByText(/CE/).first(),
    ).toBeAttached();

    await page.getByText("Pick a column to group by", { exact: true }).click();
    await popover(page).getByText(/Created At/).first().click();
  });

  test("should be possible to sort by using custom expression (metabase#6239)", async ({
    page,
  }) => {
    await page.getByText("Sort", { exact: true }).click();
    await popover(page).getByText(/^CE$/).first().click();

    await visualize(page);

    // Line chart renders initially. Switch to the table view.
    // `.Icon-table2` is QuestionDisplayToggle's "Switch to data" segment. Both
    // of that SegmentedControl's radios are `disabled: true` BY DESIGN and the
    // control ROOT handles the click; Playwright reads `disabled` off ancestors
    // where Cypress does not, so this needs force (PORTING, canonical case).
    // Scoped to this control only — the view-footer "Visualization" button is a
    // different element and takes a plain click.
    await icon(page, "table2").click({ force: true });

    const cells = page.locator("[data-testid=cell-data]");

    await expect(cells.nth(1)).toContainText("CE");
    await expect(cells.nth(1).locator(".Icon-chevronup").first()).toBeAttached();

    await expect(cells.nth(3)).toHaveText("1");

    // Go back to the notebook editor
    await openNotebook(page);

    // Sort descending this time
    await icon(page, "arrow_up").click();
    await expect(icon(page, "arrow_up")).toHaveCount(0);
    // A bare `cy.icon("arrow_down")` still carries an implicit existence
    // assertion (Cypress fails the command if nothing matches).
    await expect(icon(page, "arrow_down").first()).toBeAttached();

    await visualize(page);

    await expect(cells.nth(1)).toContainText("CE");
    await expect(
      cells.nth(1).locator(".Icon-chevrondown").first(),
    ).toBeAttached();

    await expect(cells.nth(3)).toHaveText("584");
  });
});

test.describe("issue 9027", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();
    await entityPickerModalItem(page, 0, "Our analytics").click();
    await expect(entityPickerModalItem(page, 1, "Orders")).toBeAttached();
    await entityPickerModal(page)
      .getByRole("button", { name: "Close", exact: true })
      .click();

    await startNewNativeQuestion(page);

    await typeInNativeEditor(page, "select 0");

    // Upstream clicks Run and then immediately saves; Cypress's command queue
    // paces the two apart. Anchor on the dataset response so the save can't
    // race the run (pacing only — no assertion added).
    const dataset = waitForDataset(page);
    await page
      .getByTestId("native-query-editor-container")
      .locator(".Icon-play")
      .click();
    await dataset;

    await saveQuestion(page, QUESTION_NAME, { path: ["Our analytics"] });
  });

  test("should display newly saved question in the 'Saved Questions' list immediately (metabase#9027)", async ({
    page,
  }) => {
    await goToSavedQuestionPickerAndAssertQuestion(page, QUESTION_NAME);
    await openNavigationSidebar(page);
    await archiveQuestion(page, QUESTION_NAME);
    await goToSavedQuestionPickerAndAssertQuestion(page, QUESTION_NAME, false);
    await openNavigationSidebar(page);
    await unarchiveQuestion(page, QUESTION_NAME);
    await goToSavedQuestionPickerAndAssertQuestion(page, QUESTION_NAME);
  });
});

async function goToSavedQuestionPickerAndAssertQuestion(
  page: import("@playwright/test").Page,
  questionName: string,
  exists = true,
) {
  await startNewQuestion(page);
  await miniPickerBrowseAll(page).click();
  await entityPickerModalItem(page, 0, "Our analytics").click();

  // ANCHOR (added): `should("not.exist")` retries and is therefore satisfied
  // by "level 1 hasn't rendered yet". "Orders" is the sample instance's own
  // question and is present in BOTH the exists and not-exists variants, so it
  // proves the loaded state without prejudging the assertion under test.
  await expect(entityPickerModalItem(page, 1, "Orders")).toBeAttached();

  const item = entityPickerModal(page).getByText(questionName, { exact: true });
  if (exists) {
    await expect(item.first()).toBeAttached();
  } else {
    await expect(item).toHaveCount(0);
  }

  await entityPickerModal(page)
    .getByRole("button", { name: "Close", exact: true })
    .click();
}

async function archiveQuestion(
  page: import("@playwright/test").Page,
  questionName: string,
) {
  await navigationSidebar(page)
    .getByText("Our analytics", { exact: true })
    .click();
  await openEllipsisMenuFor(page, questionName);
  await popover(page).getByText("Move to trash", { exact: true }).click();
}

async function unarchiveQuestion(
  page: import("@playwright/test").Page,
  questionName: string,
) {
  await navigationSidebar(page).getByText("Trash", { exact: true }).click();
  await openEllipsisMenuFor(page, questionName);
  await popover(page).getByText("Restore", { exact: true }).click();
}

test.describe("issue 14957", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  const PG_DB_NAME = "QA Postgres12";

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should save a question before query has been executed (metabase#14957)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    await page.getByTestId("gui-builder-data").click();
    await page.getByLabel(PG_DB_NAME, { exact: true }).click();
    await typeInNativeEditor(page, "select pg_sleep(60)");
    await saveQuestion(page, "14957", { path: ["Our analytics"] });
    await expect(modal(page)).toHaveCount(0);
  });
});

test.describe(
  "postgres > question > custom columns",
  { tag: "@external" },
  () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore("postgres-12");
      await mb.signInAsAdmin();

      const schema = (await (
        await mb.api.get(`/api/database/${WRITABLE_DB_ID}/schema/public`)
      ).json()) as { id: number; name: string }[];
      const tableId = schema.find((table) => table.name === "orders")?.id;
      expect(tableId).toBeDefined();

      // NOT the shared openTable: its notebook branch drops the `database`
      // option and hardcodes the sample DB. See the helper's comment.
      await openTableNotebookInDatabase(page, WRITABLE_DB_ID, tableId as number);

      await page.getByRole("button", { name: "Summarize", exact: true }).click();
    });

    test("`Percentile` custom expression function should accept two parameters (metabase#15714)", async ({
      page,
    }) => {
      await page.getByText("Pick a function or metric", { exact: true }).click();
      await page.getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetailsForced(page, {
        formula: "Percentile([Subtotal], 0.1)",
        format: true,
      });

      // ANCHOR (added): the absence check below retries, so it would also pass
      // against an editor that has not rendered the formula yet. Gate on the
      // formatted formula actually being in the editor first.
      await expect(
        page.getByTestId("custom-expression-query-editor"),
      ).toContainText("Percentile");

      await expect(
        page.getByText("Function Percentile expects 1 argument", {
          exact: true,
        }),
      ).toHaveCount(0);

      await typeExpressionName(page, "Expression name");
      const done = page.getByRole("button", { name: "Done", exact: true });
      await expect(done).toBeEnabled();
      await done.click();
      // Todo: Add positive assertions once this is fixed

      await expect(
        page
          .getByTestId("aggregate-step")
          .getByText(/Expression name/)
          .first(),
      ).toBeAttached();
    });
  },
);

const PG_DB_ID = 2;

const nativeTimeCastQuestion = {
  native: {
    query: `select mytz as "ts", mytz::text as "tsAStext", state, mytz::time as "time - LOOK AT THIS COLUMN", mytz::time::text as "timeAStext", mytz::time(0) as "time(0) - ALL INCORRECT", mytz::time(3) as "time(3) - MOSTLY WORKING" from (
      select '2022-05-04 16:29:59.268160-04:00'::timestamptz as mytz, 'incorrect' AS state union all
      select '2022-05-04 16:29:59.412459-04:00'::timestamptz, 'good' union all
      select '2022-05-08 13:14:42.926221-04:00'::timestamptz, 'incorrect' union all
      select '2022-05-08 13:14:42.132026-04:00'::timestamptz, 'good' union all
      select '2022-05-10 07:38:58.987352-04:00'::timestamptz, 'incorrect' union all
      select '2022-05-10 07:38:58.001001-04:00'::timestamptz, 'good' union all
      select '2022-05-12 11:01:23.000000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2022-05-12 11:01:23.000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2022-05-12 11:01:23-04:00'::timestamptz, 'ALWAYS incorrect'
  )x`,
  },
  database: PG_DB_ID,
};

// time, time(0), time(3)
const castColumns = 3;

const correctValues = [
  { value: "1:29 PM", rows: 2 },
  { value: "10:14 AM", rows: 2 },
  { value: "4:38 AM", rows: 2 },
  { value: "8:01 AM", rows: 3 },
];

test.describe("issue 15876", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should correctly cast to `TIME` (metabase#15876)", async ({
    page,
    mb,
  }) => {
    const card = await createNativeQuestion(mb.api, nativeTimeCastQuestion);
    await visitQuestion(page, card.id);

    const root = page.getByTestId("query-visualization-root");
    for (const { value, rows } of correctValues) {
      const count = rows * castColumns;
      await expect(root.getByText(value, { exact: true })).toHaveCount(count);
    }
  });
});

test.describe("issue 17514", () => {
  const questionDetails = {
    name: "17514",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  };

  const filter = {
    name: "All Options",
    slug: "date_filter",
    id: "23ccbbf",
    type: "date/all-options",
    sectionId: "date",
  };

  const dashboardDetails = { parameters: [filter] };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("scenario 1", () => {
    let cardId = 0;
    let dashboardId = 0;

    test.beforeEach(async ({ page, mb }) => {
      const card = await createQuestionAndDashboard(mb.api, {
        questionDetails,
        dashboardDetails,
      });
      cardId = card.card_id;
      dashboardId = card.dashboard_id;

      await editDashboardCard(mb.api, card, {
        parameter_mappings: [
          {
            parameter_id: filter.id,
            card_id: cardId,
            target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
          },
        ],
      });

      // visitDashboard already awaits every first-tab dashcard query, which is
      // exactly what upstream's cy.wait("@cardQuery") consumes here.
      await visitDashboard(page, mb.api, dashboardId);

      await expect(
        page.getByText("110.93", { exact: true }).first(),
      ).toBeVisible();
    });

    test("should not show the run overlay when we apply dashboard filter on a question with removed column and then click through its title (metabase#17514-1)", async ({
      page,
    }) => {
      await editDashboard(page);

      // openVisualizationOptions()
      await showDashboardCardActions(page);
      await icon(page, "palette").first().dispatchEvent("click");

      // hideColumn("Products → Ean")
      await page
        .getByTestId("chartsettings-sidebar")
        .getByTestId("draggable-item-Products → Ean")
        .locator(".Icon-eye_outline")
        .first()
        .dispatchEvent("click");

      // closeModal()
      await modal(page)
        .getByRole("button", { name: "Done", exact: true })
        .click();

      await saveDashboard(page);

      const dashcardQuery = waitForDashcardQuery(page, dashboardId, cardId);

      await filterWidget(page).first().click();
      await setAdHocFilterTimeBucket(page, "years");

      await expect
        .poll(() => new URL(page.url()).search)
        .toBe("?date_filter=past30years");
      await dashcardQuery;

      await page
        .getByTestId("parameter-value-widget-target")
        .getByText("Previous 30 years", { exact: true })
        .click();

      await page
        .getByTestId("parameter-value-dropdown")
        .getByText("Update filter", { exact: true })
        .click();

      const dataset = waitForDataset(page);
      await page
        .getByTestId("legend-caption")
        .getByText("17514", { exact: true })
        .click();
      await dataset;

      // cy.findByTextEnsureVisible("Subtotal")
      await expect(
        page.getByText("Subtotal", { exact: true }).first(),
      ).toBeVisible();

      await expect(
        page.getByTestId("question-row-count").getByText(/^Showing .+ rows$/),
      ).toBeVisible();

      const value = queryBuilderMain(page)
        .getByText("79.37", { exact: true })
        .nth(0);
      await expect(value).toBeVisible();
      await value.click();

      await expect(page.getByTestId("click-actions-view")).toContainText(
        "Filter by this value",
      );
    });
  });

  test.describe("scenario 2", () => {
    test.beforeEach(async ({ page, mb }) => {
      const card = await createQuestion(mb.api, questionDetails);
      await visitQuestion(page, card.id);

      await openVizSettingsSidebar(page);

      // moveColumnToTop("Subtotal")
      const dragColumn = page
        .getByTestId("sidebar-left")
        .locator('[data-testid^="draggable-item"]')
        .filter({ hasText: "Subtotal" })
        .first();
      await expect(dragColumn).toBeVisible();
      await moveDnDKitElementVertically(dragColumn, -130);

      await openNotebook(page);

      // removeJoinedTable()
      await page
        .getByText("Join data", { exact: true })
        .first()
        .locator("xpath=..")
        .getByLabel("Remove step", { exact: true })
        .dispatchEvent("click");

      await visualize(page);

      await expect(
        page.getByText("Subtotal", { exact: true }).first(),
      ).toBeVisible();

      // Update the question
      const updateCard = waitForUpdateCard(page);
      await queryBuilderHeader(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await page
        .getByTestId("save-question-modal")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await updateCard;
      await expect(page.getByTestId("save-question-modal")).toHaveCount(0);
    });

    test("should not show the run overlay because of the references to the orphaned fields (metabase#17514-2)", async ({
      page,
    }) => {
      await openNotebook(page);

      await join(page);
      await miniPicker(page)
        .getByText("Sample Database", { exact: true })
        .click();
      // The mini-picker list re-renders as its data loads and React reuses the
      // row nodes, so a locator resolved too early clicks the wrong table
      // (PORTING). Gate on the row being stable/visible first.
      const products = miniPicker(page).getByText("Products", { exact: true });
      await expect(products).toBeVisible();
      await products.click();

      await visualize(page);

      // Wait until view results are done rendering
      await expect(
        queryBuilderMain(page).getByText("Doing science...", { exact: true }),
      ).toHaveCount(0);

      // Cypress cannot click elements that are blocked by an overlay so this
      // will immediately fail if the issue is not fixed
      await tableHeaderClick(page, "Subtotal");
      await expect(page.getByTestId("click-actions-view")).toContainText(
        "Filter by this column",
      );
    });
  });
});

test.describe("issue 17910", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("revisions should work after creating a question without reloading (metabase#17910)", async ({
    page,
  }) => {
    await openOrdersTable(page);

    const createCard = waitForCreateCard(page);
    await page.getByText("Save", { exact: true }).first().click();
    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();
    await createCard;

    await questionInfoButton(page).click();

    const sheet = sidesheet(page);

    // PLACEHOLDER TRAP: resolve the description field ONCE and reuse that
    // handle. `cy.type()` also clicks its subject first, and the blur must hit
    // the element that was typed into (never a re-resolved placeholder query).
    const description = sheet.getByPlaceholder("Add description").first();
    await description.click();
    await page.keyboard.type("A description");

    const updateCard = waitForUpdateCard(page);
    await description.blur();
    await updateCard;

    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    await expect(
      sheet
        .getByTestId("saved-question-history-list")
        .getByTestId("revision-history-event"),
    ).toHaveCount(2);
  });
});

test.describe("issues 11914, 18978, 18977, 23857", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await createQuestion(mb.api, {
      name: "Repro",
      query: {
        "source-table": `card__${ORDERS_QUESTION_ID}`,
        limit: 2,
      },
    });
    await mb.signIn("nodata");
  });

  test("should not display query editing controls and 'Browse databases' link", async ({
    page,
  }) => {
    // Make sure we don't offer to duplicate question with a query for which the
    // user has no permission to run (metabase#23857)
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await page.getByLabel("Move, trash, and more…", { exact: true }).click();
    // H.popover() carries an implicit visibility assertion — port it, so the
    // absence check below can't pass against an unrendered popover.
    await expect(popover(page)).toBeVisible();
    await expect(
      popover(page).getByText("Duplicate", { exact: true }),
    ).toHaveCount(0);

    // Make sure we don't offer to duplicate question based on a question with a
    // query for which the user has no permission to run (metabase#23857)
    // (close actions menu, without this "Search" button is treated as hidden)
    await page.getByLabel("Move, trash, and more…", { exact: true }).click();
    await commandPaletteSearch(page, "Repro");
    await commandPalette(page).getByText("Repro", { exact: true }).click();
    await page.getByLabel("Move, trash, and more…", { exact: true }).click();
    await expect(popover(page)).toBeVisible();
    await expect(
      popover(page).getByText("Duplicate", { exact: true }),
    ).toHaveCount(0);

    // Make sure we don't prompt user to browse databases from the sidebar
    await openNavigationSidebar(page);
    await expect(
      page.getByLabel("Browse databases", { exact: true }),
    ).toHaveCount(0);

    // Make sure we don't prompt user to create a new query
    await icon(appBar(page), "add").click();
    const newPopover = popover(page);
    await expect(
      newPopover.getByText("Dashboard", { exact: true }),
    ).toBeVisible();
    await expect(
      newPopover.getByText("Question", { exact: true }),
    ).toHaveCount(0);
    await expect(newPopover.getByText(/SQL query/)).toHaveCount(0);
    await expect(newPopover.getByText("Model", { exact: true })).toHaveCount(0);

    // Click anywhere to close the "new" button popover.
    // Cypress rounds a "topLeft" position with Math.ceil, i.e. (0, 0).
    await page.locator("body").click({ position: { x: 0, y: 0 } });

    // Make sure we don't prompt user to perform any further query manipulations
    const actionPanel = page.getByTestId("qb-header-action-panel");
    // cy.icon(x).should("be.visible") on a multi-element subject is an
    // ANY-of-set assertion (PORTING rule 3).
    await expect(
      icon(actionPanel, "refresh").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      icon(actionPanel, "bookmark").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(actionPanel.getByTestId("notebook-button")).toHaveCount(0);
    await expect(
      actionPanel.getByText("Filter", { exact: true }),
    ).toHaveCount(0);
    await expect(
      actionPanel.getByText("Summarize", { exact: true }),
    ).toHaveCount(0);
    await expect(
      actionPanel.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0);

    // Make sure drill-through menus do not appear
    // No drills when clicking a column header
    await page
      .getByTestId("header-cell")
      .filter({ hasText: /Subtotal/ })
      .first()
      .click();
    await assertNoOpenPopover(page);

    // No drills when clicking a regular cell
    await page
      .getByRole("gridcell")
      .filter({ hasText: /37\.65/ })
      .first()
      .click();
    await assertNoOpenPopover(page);

    // No drills when clicking on a FK
    await page
      .locator(".test-Table-FK")
      .filter({ hasText: /123/ })
      .first()
      .click();
    await assertNoOpenPopover(page);

    // assertIsNotAdHoc(): ad-hoc questions have a base64 hash in the URL
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect(saveButton(page)).toHaveCount(0);

    // Make sure user can change visualization but not save the question
    await openVizTypeSidebar(page);
    await leftSidebar(page).getByTestId("more-charts-toggle").click();
    await icon(leftSidebar(page), "number").first().click();
    await expect(page.getByTestId("scalar-value")).toBeAttached();

    // assertSaveIsDisabled(). `aria-disabled` is not a boolean attribute, so
    // unlike `disabled` the VALUE really is compared here.
    await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");

    // Make sure we don't prompt user to refresh the updated query.
    // Rerunning a query with changed viz settings will make it use the
    // `/dataset` endpoint, so a user will see the "You don't have permission"
    // error. assertNoRefreshButton():
    await expect(
      icon(page.getByTestId("qb-header-action-panel"), "refresh"),
    ).toHaveCount(0);
  });
});

function saveButton(page: import("@playwright/test").Page) {
  return queryBuilderHeader(page).getByRole("button", {
    name: "Save",
    exact: true,
  });
}

test.describe("issue 19341", () => {
  const TEST_NATIVE_QUESTION_NAME = "Native";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mockSessionProperty(page, "enable-nested-queries", false);
    await mb.signInAsAdmin();
    await createNativeQuestion(mb.api, {
      name: TEST_NATIVE_QUESTION_NAME,
      native: { query: "SELECT * FROM products" },
    });
  });

  test("should correctly disable nested queries (metabase#19341)", async ({
    page,
  }) => {
    // Test "Saved Questions" table is hidden in QB data selector
    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();

    const picker = entityPickerModal(page);
    await expect(picker).toBeVisible();
    await expect(picker.getByTestId("loading-indicator")).toHaveCount(0);
    await picker.getByText("Sample Database", { exact: true }).click();
    await expect(
      picker.getByText("Orders", { exact: true }).first(),
    ).toBeAttached();

    // Ensure the search doesn't list saved questions
    const search = waitForSearch(page);
    await picker.getByPlaceholder("Search…").pressSequentially("Ord");
    await search;
    await expect(picker.getByTestId("loading-indicator")).toHaveCount(0);

    // ANCHOR (added): the set assertions below read whatever result-items
    // happen to be mounted; require at least one before reading them.
    await expect(
      picker.getByTestId("result-item").first(),
    ).toBeVisible();
    const modelTypes = new Set(
      await picker
        .getByTestId("result-item")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-model-type")),
        ),
    );
    expect(modelTypes.has("card")).toBe(false);
    expect(modelTypes.has("table")).toBe(true);

    await picker.getByText("Orders", { exact: true }).first().click();

    await icon(page, "join_left_outer").click();
    await miniPickerBrowseAll(page).click();
    await expect(entityPickerModal(page)).toBeVisible();
    await expect(
      entityPickerModal(page).getByTestId("loading-indicator"),
    ).toHaveCount(0);
    await expect(entityPickerModal(page).getByRole("tab")).toHaveCount(0);

    // Test "Explore results" button is hidden for native questions
    await page.goto("/collection/root");
    const cardQuery = waitForCardQuery(page);
    await page.getByText(TEST_NATIVE_QUESTION_NAME, { exact: true }).click();
    await cardQuery;
    await expect(
      page.getByText("Explore results", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 19742", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  // In order to reproduce the issue, it's important to only use in-app links
  // and don't refresh the app state (like by doing cy.visit)
  test("shouldn't auto-close the data selector after a table was hidden", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByText("New", { exact: true }).first().click();

    await popover(page).getByText("Question", { exact: true }).click();
    await miniPickerBrowseAll(page).click();
    await entityPickerModalItem(page, 0, "Databases").click();
    await entityPickerModalItem(page, 1, "Sample Database").click();
    await expect(
      entityPickerModal(page).getByText("Orders", { exact: true }).first(),
    ).toBeAttached();
    await entityPickerModal(page)
      .getByRole("button", { name: "Close", exact: true })
      .click();

    await openNavigationSidebar(page);
    await goToAdmin(page);

    await page.getByText("Table Metadata", { exact: true }).click();

    const orders = tablePickerTable(page, "Orders");
    await expect(orders).toBeVisible();
    // The visibility toggle only paints on row hover (PORTING rule 4).
    await orders.hover();
    const updateTable = waitForUpdateTable(page);
    await orders
      .getByRole("button", { name: "Hide table", exact: true })
      .click();
    await updateTable;

    await goToMainApp(page);

    await page.getByText("New", { exact: true }).first().click();
    await popover(page).getByText("Question", { exact: true }).click();

    await miniPickerBrowseAll(page).click();
    await entityPickerModalItem(page, 0, "Databases").click();
    await entityPickerModalItem(page, 1, "Sample Database").click();

    const picker = entityPickerModal(page);
    // ANCHOR (added): the "Orders" absence check retries and so is satisfied by
    // an unrendered level-1 list. "Products" is upstream's own next assertion
    // and is present in the loaded state, so gate on it before the absence
    // check rather than after.
    await expect(picker.getByText("Products", { exact: true })).toBeVisible();

    await expect(picker.getByText("Orders", { exact: true })).toHaveCount(0);
    await expect(
      picker.getByText("Products", { exact: true }).first(),
    ).toBeAttached();
    await expect(
      picker.getByText("Reviews", { exact: true }).first(),
    ).toBeAttached();
    await expect(
      picker.getByText("People", { exact: true }).first(),
    ).toBeAttached();
  });
});

const QUESTION_1 = {
  name: "Q1",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

const QUESTION_2 = {
  name: "Q2",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [
      ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
    ],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

test.describe("issue 19893", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display correct join source table when joining visited questions (metabase#19893)", async ({
    page,
    mb,
  }) => {
    test.skip(true, "Tagged @skip upstream — never runs in CI");

    const q1 = await createQuestion(mb.api, QUESTION_1);
    await visitQuestion(page, q1.id);
    const q2 = await createQuestion(mb.api, QUESTION_2);
    await visitQuestion(page, q2.id);

    const joined = await createQ1PlusQ2Question(mb.api, q1.id, q2.id);
    await page.goto(`/question/${joined.id}/notebook`);

    await assertQ1PlusQ2Joins(page);
  });

  test("should display correct join source table when joining non-visited questions (metabase#19893)", async ({
    page,
    mb,
  }) => {
    test.skip(true, "Tagged @skip upstream — never runs in CI");

    const q1 = await createQuestion(mb.api, QUESTION_1);
    const q2 = await createQuestion(mb.api, QUESTION_2);

    const joined = await createQ1PlusQ2Question(mb.api, q1.id, q2.id);
    await page.goto(`/question/${joined.id}/notebook`);

    await assertQ1PlusQ2Joins(page);
  });
});

function createQ1PlusQ2Question(
  api: import("../support/api").MetabaseApi,
  questionId1: number,
  questionId2: number,
) {
  return createQuestion(api, {
    name: "Q1 + Q2",
    query: {
      "source-table": `card__${questionId1}`,
      joins: [
        {
          fields: "all",
          strategy: "left-join",
          alias: "Q2 - Category",
          condition: [
            "=",
            ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            [
              "field",
              PRODUCTS.CATEGORY,
              { "base-type": "type/Text", "join-alias": "Q2 - Category" },
            ],
          ],
          "source-table": `card__${questionId2}`,
        },
      ],
    },
  });
}

async function assertQ1PlusQ2Joins(page: import("@playwright/test").Page) {
  const step = getNotebookStep(page, "join");

  const items = step.getByTestId("notebook-cell-item");
  await expect(items.nth(0)).toContainText(QUESTION_1.name);
  await expect(items.nth(1)).toContainText(QUESTION_2.name);

  const left = step.getByLabel("Left column", { exact: true });
  await expect(
    left.getByText(QUESTION_1.name, { exact: true }).first(),
  ).toBeAttached();
  await expect(
    left.getByText("Category", { exact: true }).first(),
  ).toBeAttached();

  const right = step.getByLabel("Right column", { exact: true });
  await expect(
    right.getByText(QUESTION_2.name, { exact: true }).first(),
  ).toBeAttached();
  await expect(
    right.getByText("Q2 - Category → Category", { exact: true }).first(),
  ).toBeAttached();
}
