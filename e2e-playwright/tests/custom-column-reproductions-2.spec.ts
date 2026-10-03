/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/custom-column-reproductions-2.cy.spec.js
 *
 * Collision check (PORTING: two upstream specs can share a basename): the
 * source directory holds exactly ONE `custom-column-reproductions-2` file and
 * it is the `.js` (the `.ts` siblings there are cc-boolean-functions,
 * cc-fields, cc-literals, cc-shortcuts*), and `tests/` had no
 * `custom-column-reproductions-2.spec.ts`. This is the direct sibling of the
 * already-landed `custom-column-reproductions-1.spec.ts`.
 *
 * A reproductions file: every describe is an independent regression guard, so
 * nothing here is merged, dropped or weakened.
 *
 * Gating, as upstream tags it:
 * - `@external` (issue 38498) drives the QA Postgres12 container and is gated
 *   on the deliberate PW_QA_DB_ENABLED (bare QA_DB_ENABLED leaks truthy from
 *   cypress.env.json on dev machines).
 * - `@skip` (issue 58371, and 57674's first test) is ported in full but
 *   declared `test.skip(true, ...)`, matching upstream's tag.
 * Every other describe runs on the plain `default` snapshot — no container.
 *
 * The expression editor is CodeMirror, driven with real keystrokes
 * (page.keyboard IS CDP input, the equivalent of the upstream cy.realType),
 * with editor focus asserted before typing.
 *
 * Port decisions recorded rather than hidden:
 * - Issue 12938 declares TWO tests with the SAME title. Cypress tolerates
 *   duplicates; in Playwright a duplicate title is a hard load error for the
 *   whole file, so the second is suffixed (subject unchanged).
 * - `allowFastSet: true` (57674, 26512) is not "type faster" — it replaces the
 *   editor's textContent wholesale and then nudges the validator. Ported as
 *   such (support/custom-column-reproductions-2.ts fastSetExpression);
 *   re-typing those formulas for real would fire close-brackets/autocomplete
 *   and produce a different document.
 * - 54638 navigates to metabase.com. The docs origin is stubbed with an empty
 *   200 so the run does not depend on the public internet; the URL assertion
 *   (the entire subject of the test) is untouched.
 * - `cy.button("Done")` is page-wide upstream; here it is scoped to the
 *   expression-editor popover, which resolves the same single element and
 *   avoids a strict-mode violation when a second Done exists.
 */
import type { Page } from "@playwright/test";

import {
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
} from "../support/ad-hoc-question";
import { helpText, helpTextHeader } from "../support/cc-typing-suggestion";
import {
  customExpressionCompletion,
  customExpressionCompletions,
  customExpressionName,
  expectCustomExpressionValue,
  formatExpression,
  functionBrowser,
} from "../support/custom-column-3";
import {
  focusedElement,
  typeInEditor,
} from "../support/custom-column-reproductions-1";
import {
  blurEditor,
  clearEditor,
  clickCompletion,
  dispatchClick,
  enterExpressionDetails,
  expectNotOverflowingHorizontally,
  expectNotScrollableHorizontally,
  fastSetExpression,
  stubDocsOrigin,
  typeExpression,
} from "../support/custom-column-reproductions-2";
import { createQuestion } from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { filterSimple } from "../support/filter";
import { test, expect } from "../support/fixtures";
import { addCustomColumn } from "../support/joins";
import { tableInteractive } from "../support/models";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  assertQueryBuilderRowCount,
  expressionEditorWidget,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { searchMiniPickerAndSelect } from "../support/question-reproductions-3";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { tableInteractiveHeader } from "../support/table-column-settings";
import { modal, popover, visitQuestion } from "../support/ui";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const QA_DB_SKIP_REASON =
  "Requires the QA Postgres database + its snapshot (set PW_QA_DB_ENABLED)";

/** Port of `H.popover().button("Done")` / `cy.button("Done")`. */
function doneButton(page: Page) {
  return expressionEditorWidget(page).getByRole("button", {
    name: "Done",
    exact: true,
  });
}

/** Port of `H.expressionEditorWidget().button("Cancel")`. */
function cancelButton(page: Page) {
  return expressionEditorWidget(page).getByRole("button", {
    name: "Cancel",
    exact: true,
  });
}

/** Port of `H.summarize({ mode: "notebook" })` (initiateAction notebook arm). */
async function summarizeNotebook(page: Page) {
  await page.getByTestId("action-buttons").locator(".Icon-sum").click();
}

/** Port of `H.filter({ mode: "notebook" })`. */
async function filterNotebook(page: Page) {
  await page.getByTestId("action-buttons").locator(".Icon-filter").click();
}

/** Port of `H.popover().findByText("Custom Expression").click()`. */
async function openCustomExpression(page: Page) {
  await popover(page).getByText("Custom Expression", { exact: true }).click();
}

/** Port of `cy.get("main").findByText("There was a problem with your question")`. */
function questionProblemText(page: Page) {
  return page
    .locator("main")
    .getByText("There was a problem with your question", { exact: true });
}

test.describe("issue 54638", () => {
  const DOCS_URL =
    "https://www.metabase.com/docs/latest/questions/query-builder/expressions/case.html";

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
    await addCustomColumn(page);
  });

  test("should be possible to click documentation links in the expression editor help text popover (metabase#54638)", async ({
    page,
  }) => {
    await stubDocsOrigin(page);
    await typeExpression(page, "case(");

    const learnMore = helpText(page).getByText("Learn more", { exact: true });
    await learnMore.scrollIntoViewIfNeeded();
    await expect(learnMore).toBeVisible();
    await expect(learnMore).toHaveAttribute("target", "_blank");

    // Upstream rewrites target to _self because Cypress cannot test a second
    // tab; keep the rewrite so the assertion below is about THIS page's url.
    await learnMore.evaluate((element) =>
      element.setAttribute("target", "_self"),
    );

    await Promise.all([
      page.waitForURL((url) => url.toString() === DOCS_URL),
      learnMore.click(),
    ]);
    expect(page.url()).toBe(DOCS_URL);
  });
});

test.describe("issue #54722", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
  });

  test("should focus the editor when opening it (metabase#54722)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await expect(focusedElement(page)).toHaveAttribute("role", "textbox");
    await cancelButton(page).click();

    await filterNotebook(page);
    await openCustomExpression(page);
    await expect(focusedElement(page)).toHaveAttribute("role", "textbox");
    await cancelButton(page).click();

    await summarizeNotebook(page);
    await openCustomExpression(page);
    await expect(focusedElement(page)).toHaveAttribute("role", "textbox");
    await cancelButton(page).click();
  });
});

test.describe("issue #31964", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
  });

  // Upstream titles this test "…(metabase#54722)" — kept verbatim; the describe
  // is what identifies the issue.
  test("should focus the editor when opening it (metabase#54722)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await typeExpression(page, 'case([Product -> Category] = "Widget", 1,');

    // Upstream's bare `cy.realPress("Enter")`. The completions popup IS open
    // here (measured), but with no option selected CodeMirror's acceptCompletion
    // declines and Enter falls through to insertNewline — which is what the
    // two-line expected value below asserts.
    await page.keyboard.press("Enter");

    await typeInEditor(page, "[Product -> Categ", { focus: false });

    // `cy.realPress("Tab")` here IS a completion accept. Cypress's per-command
    // queue latency supplies the settle that CodeMirror needs before it will
    // take the suggestion; page.keyboard has none, so gate on the popup and
    // mirror the upstream acceptCompletion 300ms wait.
    await expect(customExpressionCompletions(page)).toBeVisible();
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");

    await expectCustomExpressionValue(
      page,
      'case([Product → Category] = "Widget", 1,\n[Product → Category])',
    );
  });
});

test.describe("issue #55686", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
  });

  test("should show suggestions for functions even when the current token is an operator (metabase#55686)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await typeExpression(page, "not");

    await expect(customExpressionCompletion(page, "notNull")).toBeVisible();
    await expect(customExpressionCompletion(page, "notEmpty")).toBeVisible();
  });
});

test.describe("issue #55940", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
  });

  test("should show the correct example for Offset (metabase#55940)", async ({
    page,
  }) => {
    await summarizeNotebook(page);
    await openCustomExpression(page);

    await typeExpression(page, "Offset(");
    await expect(helpText(page)).toBeVisible();
    await expect(helpText(page)).toContainText("Offset(Sum([Total]), -1)");
  });
});

test.describe("issue #55984", () => {
  const LONG_NAME =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt";

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
  });

  test("should not overflow the suggestion tooltip when a suggestion name is too long (metabase#55984)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      formula: "[Total]",
      name: LONG_NAME,
    });
    await doneButton(page).click();

    await summarizeNotebook(page);
    await openCustomExpression(page);
    await typeExpression(page, "[lo");
    await expect(customExpressionCompletions(page)).toBeVisible();
    // Upstream's assertion, verbatim — and vacuous here (overlay scrollbars
    // reserve no layout height, so H.isScrollableHorizontally can never report
    // true; see the helper's comment for the measurement). The second call is
    // an explicit strengthening that measures the overflow directly.
    await expectNotScrollableHorizontally(customExpressionCompletions(page));
    await expectNotOverflowingHorizontally(customExpressionCompletions(page));
  });

  test("should not overflow the suggestion tooltip when a suggestion name is too long and has no spaces (metabase#55984)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      formula: "[Total]",
      name: LONG_NAME.replaceAll(" ", "_"),
    });
    await doneButton(page).click();

    await summarizeNotebook(page);
    await openCustomExpression(page);
    await typeExpression(page, "[lo");
    await expect(customExpressionCompletions(page)).toBeVisible();
    // Upstream's assertion, verbatim — and vacuous here (overlay scrollbars
    // reserve no layout height, so H.isScrollableHorizontally can never report
    // true; see the helper's comment for the measurement). The second call is
    // an explicit strengthening that measures the overflow directly.
    await expectNotScrollableHorizontally(customExpressionCompletions(page));
    await expectNotOverflowingHorizontally(customExpressionCompletions(page));
  });
});

test.describe("issue 55622", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to mix regular functions with aggregation functions (metabase#55622)", async ({
    page,
  }) => {
    await openPeopleTable(page, { mode: "notebook" });
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Summarize", exact: true })
      .click();
    await openCustomExpression(page);
    await enterExpressionDetails(page, {
      formula: 'datetimeDiff(Max([Created At]), max([Birth Date]), "minute")',
      name: "Aggregation",
    });
    await doneButton(page).click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 1);
  });
});

test.describe("issue 56152", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("Should show the help text popover when typing a multi-line expression (metabase#56152)", async ({
    page,
  }) => {
    await openPeopleTable(page, { mode: "notebook" });
    await addCustomColumn(page);
    // Upstream: dedent`datetimeDiff(\n  [Created At],`
    await typeExpression(page, "datetimeDiff(\n  [Created At],");

    await expect(helpText(page)).toBeVisible();
  });
});

test.describe("issue 56596", () => {
  // Upstream writes the formula as dedent`regexExtract([Vendor], "\\s.*")`,
  // i.e. the cooked string carries a SINGLE backslash — the point of the test.
  const EXPRESSION = 'regexExtract([Vendor], "\\s.*")';

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.ID, null]],
        limit: 1,
      },
    });
    await visitQuestion(page, id);
    await openNotebook(page);
  });

  test("should not remove backslashes from escaped characters (metabase#56596)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      formula: EXPRESSION,
      name: "Last name",
    });
    await formatExpression(page);
    await expectCustomExpressionValue(page, EXPRESSION);
    await doneButton(page).click();

    await getNotebookStep(page, "expression")
      .getByText("Last name", { exact: true })
      .click();
    await expectCustomExpressionValue(page, EXPRESSION);
    await cancelButton(page).click();

    await visualize(page);
    await assertTableData(page, {
      columns: ["ID", "Last name"],
      firstRows: [["1", " Casper and Hilll"]],
    });
  });
});

test.describe("issue 55300", () => {
  test.describe("fields", () => {
    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsNormalUser();

      const { id } = await createQuestion(mb.api, {
        query: {
          "source-table": PRODUCTS_ID,
          fields: [["field", PRODUCTS.ID, null]],
          expressions: {
            now: ["field", PRODUCTS.CREATED_AT, null],
            Count: ["+", 1, 1],
          },
        },
      });
      await visitQuestion(page, id);
      await openNotebook(page);
    });

    test("should be possible to disambiguate between fields and no-argument functions (metabase#55300)", async ({
      page,
    }) => {
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
      await typeExpression(page, "now() > now");

      // Move cursor over now
      await typeExpression(page, "{leftarrow}");
      await expect(helpTextHeader(page)).toHaveCount(0);

      // Move cursor over now()
      await typeExpression(page, "{home}");
      await expect(helpTextHeader(page)).toContainText("now()");

      await formatExpression(page);
      await expectCustomExpressionValue(page, "now() > [now]");
    });

    test("should be possible to disambiguate between fields and no-argument aggregations (metabase#55300)", async ({
      page,
    }) => {
      await summarizeNotebook(page);
      await openCustomExpression(page);

      await typeExpression(page, "Count() + Sum(Count)");

      // Move cursor over Count
      await typeExpression(page, "{leftarrow}".repeat(2));
      await expect(helpTextHeader(page)).toContainText("Sum");

      // Move cursor over Count()
      await typeExpression(page, "{home}");
      await expect(helpTextHeader(page)).toContainText("Count()");

      await formatExpression(page);
      await expectCustomExpressionValue(page, "Count() + Sum([Count])");
    });
  });

  test.describe("segments", () => {
    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      await createSegment(mb.api, {
        name: "now",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      await createSegment(mb.api, {
        name: "Count",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      const { id } = await createQuestion(mb.api, {
        query: { "source-table": ORDERS_ID },
      });
      await visitQuestion(page, id);
      await openNotebook(page);
    });

    test("should be possible to disambiguate between segments and no-argument functions (metabase#55300)", async ({
      page,
    }) => {
      await addCustomColumn(page);

      await typeExpression(page, "case(now, now(), [Created At])");

      // Move cursor over now()
      await typeExpression(page, "{leftarrow}".repeat(17));
      await expect(helpTextHeader(page)).toContainText("now()");

      // Move cursor over now
      await typeInEditor(page, "{leftarrow}".repeat(7), { focus: false });
      await expect(helpTextHeader(page)).toContainText("case");

      await formatExpression(page);
      await expectCustomExpressionValue(
        page,
        "case([now], now(), [Created At])",
      );
    });

    test("should be possible to disambiguate between segments and no-argument aggregations (metabase#55300)", async ({
      page,
    }) => {
      await summarizeNotebook(page);
      await openCustomExpression(page);

      await typeExpression(page, "Sum(case(Count, Count(), 0))");

      // Move cursor over now()
      await typeExpression(page, "{leftarrow}".repeat(7));
      await expect(helpTextHeader(page)).toContainText("Count()");

      // Move cursor over now
      await typeExpression(page, "{leftarrow}".repeat(18));
      await expect(helpTextHeader(page)).toContainText("case");

      await formatExpression(page);
      await expectCustomExpressionValue(page, "Sum(case([Count], Count(), 0))");
    });
  });

  test.describe("metrics", () => {
    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      await createQuestion(mb.api, {
        name: "Count",
        type: "metric",
        description: "A metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });

      const { id } = await createQuestion(mb.api, {
        query: { "source-table": ORDERS_ID },
      });
      await visitQuestion(page, id);
      await openNotebook(page);
    });

    test("should be possible to disambiguate between metrics and no-argument aggregations (metabase#55300)", async ({
      page,
    }) => {
      await summarizeNotebook(page);
      await openCustomExpression(page);

      await typeExpression(page, "Count + Count()");

      // Move cursor over Count()
      await typeExpression(page, "{leftarrow}".repeat(5));
      await expect(helpTextHeader(page)).toContainText("Count()");

      // Move cursor over Count
      await typeExpression(page, "{home}");
      await expect(helpTextHeader(page)).toHaveCount(0);

      await formatExpression(page);
      await expectCustomExpressionValue(page, "[Count] + Count()");
    });
  });
});

test.describe("issue 55687", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id } = await createQuestion(mb.api, {
      query: { "source-table": PRODUCTS_ID, limit: 1 },
    });
    await visitQuestion(page, id);
    await openNotebook(page);
  });

  async function addExpression(page: Page, name: string, expression: string) {
    await getNotebookStep(page, "expression").locator(".Icon-add").click();
    await enterExpressionDetails(page, { formula: expression, name });
    await doneButton(page).click();
  }

  test("should allow passing stringly-typed expressions to is-empty and not-empty (metabase#55687)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await cancelButton(page).click();

    await addExpression(page, "isEmpty - title", "isEmpty([Title])");
    await addExpression(page, "isEmpty - ltrim - title", "isEmpty(lTrim([Title]))");
    await addExpression(page, "isEmpty - literal", "isEmpty('AAA')");
    await addExpression(page, "isEmpty - ltrim - literal", "isEmpty(lTrim('AAA'))");

    await addExpression(page, "notEmpty - title", "notEmpty([Title])");
    await addExpression(page, "notEmpty - ltrim - title", "notEmpty(lTrim([Title]))");
    await addExpression(page, "notEmpty - literal", "notEmpty('AAA')");
    await addExpression(page, "notEmpty - ltrim - literal", "notEmpty(lTrim('AAA'))");

    await visualize(page);

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("There was a problem with your question", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 58371", () => {
  // Upstream tag: "@skip" — skipped there, skipped here. Ported in full so the
  // test is ready the moment upstream un-skips it.
  test.beforeEach(async ({ mb, page }) => {
    test.skip(true, "Upstream @skip tag");
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
      display_name: null,
    });

    const baseQuestion = await createQuestion(mb.api, {
      name: "Base Question",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [
          [
            "aggregation-options",
            ["count-where", ["=", ["field", PRODUCTS.TITLE, null], "OK"]],
            { "display-name": "Aggregation with Dash-in-name" },
          ],
        ],
        breakout: [["field", PRODUCTS.ID, null]],
      },
    });

    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": `card__${baseQuestion.id}`,
            alias: "Other Question",
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Other Question" }],
            ],
          },
        ],
        expressions: {
          Foo: [
            "+",
            0,
            [
              "field",
              "count_where",
              {
                "base-type": "type/Float",
                "join-alias": "Other Question",
              },
            ],
          ],
        },
      },
    });
    await visitQuestion(page, id);
    await openNotebook(page);
  });

  test("should allow using names with a dash in them from joined tables (metabase#58371)", async ({
    page,
  }) => {
    await getNotebookStep(page, "expression")
      .getByText("Foo", { exact: true })
      .click();
    await expectCustomExpressionValue(
      page,
      "0 + [Other Question → Aggregation with Dash-in-name]",
    );
  });
});

test.describe("Issue 58230", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openOrdersTable(page, { mode: "notebook" });
  });

  test("should display an error when using an aggregation function in a custom column (metabase#58230)", async ({
    page,
  }) => {
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await typeExpression(page, "Average([Total])");
    // Upstream's bare findByText carries the existence assertion.
    await expect(
      popover(page).getByText(
        "Aggregations like Average are not allowed when building a custom expression",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("should display an error when using an aggregation function in a custom filter (metabase#58230)", async ({
    page,
  }) => {
    await filterNotebook(page);
    await openCustomExpression(page);
    await typeExpression(page, "Average([Total])");
    await expect(
      popover(page).getByText(
        "Aggregations like Average are not allowed when building a custom filter",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("should not display an error when using an aggregation function in a custom aggregation (metabase#58230)", async ({
    page,
  }) => {
    await summarizeNotebook(page);
    await openCustomExpression(page);
    await typeExpression(page, "Average([Total])");
    // cy.type() clicks its subject first, then sends keystrokes.
    await customExpressionName(page).click();
    await page.keyboard.type("Foo");
    await expect(
      popover(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
  });
});

test.describe("issue 57674", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openOrdersTable(page, { mode: "notebook" });
  });

  // Upstream: "TODO: re-enable this test once we have a fix for metabase#61264"
  // — tagged "@skip". Ported in full, skipped here too.
  test("should show an error when using a case or if expression with mismatched types (metabase#57674)", async ({
    page,
  }) => {
    test.skip(true, "Upstream @skip tag (blocked on metabase#61264)");
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();

    await clearEditor(page);
    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toHaveCount(0);

    await fastSetExpression(page, 'case([Total] > 100, [Created At], "foo")');
    await blurEditor(page);

    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toBeVisible();
  });

  test("should not show an error when using a case or if expression with compatible types (metabase#57674)", async ({
    page,
  }) => {
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();

    await clearEditor(page);
    // The editor is anchored by the click above (the notebook step's Custom
    // column button), and the clear() asserts the CodeMirror instance took
    // focus — so this absence check is not sampling a pre-render window.
    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toHaveCount(0);

    await fastSetExpression(page, 'case([Total] > 100, "foo", "bar")');
    await blurEditor(page);

    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("Issue 12938", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openProductsTable(page, { mode: "notebook" });
  });

  test("should be possible to concat number with string (metabase#12938)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      formula: "concat(floor([Rating]), [Title])",
      name: "MyCustom",
    });
    await doneButton(page).click();

    await visualize(page);
    await expect(questionProblemText(page)).toHaveCount(0);
  });

  // Upstream declares this with the SAME title as the test above; a duplicate
  // title is a hard load error in Playwright, so it is suffixed here. Subject
  // and assertions unchanged.
  test("should be possible to concat number with string (metabase#12938) — hour/minute variant", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      formula: 'concat(hour([Created At]), ":", minute([Created At]))',
      name: "MyCustom",
    });
    await doneButton(page).click();

    await visualize(page);
    await expect(questionProblemText(page)).toHaveCount(0);
  });
});

test.describe("Issue 25189", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to use a custom column that just references a single column in filters in follow up question (metabase#25189)", async ({
    page,
    mb,
  }) => {
    const source = await createQuestion(mb.api, {
      name: "Question with CCreated At",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "CCreated At": [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime" },
          ],
        },
      },
    });
    const { id } = await createQuestion(mb.api, {
      query: { "source-table": `card__${source.id}` },
    });
    await visitQuestion(page, id);

    // cy.findAllByTestId("header-cell").contains(...) — case-sensitive
    // substring on the first matching element.
    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: /CCreated At/ })
        .first(),
    ).toBeVisible();

    await filterSimple(page);
    const filterPopover = popover(page);
    await expect(
      filterPopover.getByText("CCreated At", { exact: true }),
    ).toHaveCount(1);
    await filterPopover.getByText("CCreated At", { exact: true }).first().click();
    await filterPopover.getByText("Today", { exact: true }).click();

    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: /CCreated At/ })
        .first(),
    ).toBeVisible();

    await expect(questionProblemText(page)).toHaveCount(0);
  });

  test("should be possible to use a custom column that just references a single column in filters in follow up question, when the custom column has the same name as the column (metabase#25189)", async ({
    page,
    mb,
  }) => {
    const source = await createQuestion(mb.api, {
      name: "Question with Created At",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "Created At": [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime" },
          ],
        },
      },
    });
    const { id } = await createQuestion(mb.api, {
      query: { "source-table": `card__${source.id}` },
    });
    await visitQuestion(page, id);

    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: /Created At/ })
        .first(),
    ).toBeVisible();

    await filterSimple(page);
    let filterPopover = popover(page);
    await expect(
      filterPopover.getByText("Created At", { exact: true }),
    ).toHaveCount(2);
    await filterPopover.getByText("Created At", { exact: true }).first().click();
    await filterPopover.getByText("Today", { exact: true }).click();

    await filterSimple(page);
    filterPopover = popover(page);
    await expect(
      filterPopover.getByText("Created At", { exact: true }),
    ).toHaveCount(2);
    await filterPopover.getByText("Created At", { exact: true }).last().click();
    await filterPopover.getByText("Today", { exact: true }).click();

    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: /Created At/ })
        .first(),
    ).toBeVisible();

    await expect(questionProblemText(page)).toHaveCount(0);
  });
});

test.describe("Issue 26512", () => {
  const TEST_CASES = [
    'year("a string")',
    'month("a string")',
    'day("a string")',
    'hour("a string")',
    'minute("a string")',
    'datetimeAdd("a string", 1, "day")',
    'datetimeDiff("a string", 1, "day")',
    "year(1)",
    "month(42)",
    "day(102)",
    "hour(140)",
    "minute(55)",
    'datetimeAdd(42, 1, "day")',
    'datetimeDiff(42, 1, "day")',
    "year(true)",
    "month(true)",
    "day(true)",
    "hour(true)",
    "minute(true)",
    'datetimeAdd(true, 1, "day")',
    'datetimeDiff(true, 1, "day")',
  ];

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await openOrdersTable(page, { mode: "notebook" });
  });

  test("should validate types for date/time functions (metabase#26512)", async ({
    page,
  }) => {
    await addCustomColumn(page);

    for (const formula of TEST_CASES) {
      await clearEditor(page);
      await fastSetExpression(page, formula);
      await blurEditor(page);
      await expect(
        popover(page).getByText(/Types are incompatible/),
      ).toBeVisible();
    }
  });
});

test.describe("Issue 38498", () => {
  // Upstream tag: "@external" (QA Postgres12).
  const PG_DB_NAME = "QA Postgres12";

  test.beforeEach(async ({ mb, page }) => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();

    await startNewQuestion(page);
    const picker = miniPicker(page);
    await expect(picker.getByText(PG_DB_NAME, { exact: true })).toBeVisible();
    await picker.getByText(PG_DB_NAME, { exact: true }).click();
    await picker.getByText("Orders", { exact: true }).click();
  });

  test("should not be possible to use convertTimezone with an invalid timezone (metabse#38498)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await typeExpression(
      page,
      'convertTimezone([Created At], "Asia/Ho_Chi_Mihn", "UTC")',
    );
    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 52451", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to use a custom expression in a join condition from the same stage in the LHS (metabase#52451)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      name: "Expr",
      formula: "[ID] * 1000",
    });
    await doneButton(page).click();

    await page.getByRole("button", { name: "Join data", exact: true }).click();
    const picker = miniPicker(page);
    await picker.getByText("Sample Database", { exact: true }).click();
    await picker.getByText("Reviews", { exact: true }).click();

    await popover(page).getByText("Expr", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await getNotebookStep(page, "join")
      .getByLabel("Change join type", { exact: true })
      .click();
    await popover(page).getByText("Inner join", { exact: true }).click();

    await visualize(page);
    await assertQueryBuilderRowCount(page, 1);
  });
});

test.describe("issue 56602", () => {
  const productsModelDetails = {
    name: "M1",
    type: "model" as const,
    query: { "source-table": PRODUCTS_ID },
  };

  const ordersModelDetails = {
    name: "M2",
    type: "model" as const,
    query: { "source-table": ORDERS_ID },
  };

  const expressionName = "awesome stuff";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to use expressions when joining models (metabase#56602)", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, productsModelDetails);
    await createQuestion(mb.api, ordersModelDetails);
    await startNewQuestion(page);

    // The notebook data-step search input is autofocused and lives OUTSIDE
    // [data-testid=mini-picker], so H.miniPicker().within(cy.realType) scopes
    // nothing — type at the picker's own search box.
    await searchMiniPickerAndSelect(page, productsModelDetails.name);

    await page.getByRole("button", { name: "Join data", exact: true }).click();
    await searchMiniPickerAndSelect(page, ordersModelDetails.name);

    await addCustomColumn(page);
    await enterExpressionDetails(page, {
      name: expressionName,
      formula: `coalesce([User -> Birth Date], [${ordersModelDetails.name} -> Created At])`,
    });
    await doneButton(page).click();
    await visualize(page);
    await expect(tableInteractive(page)).toBeVisible();
    await expect(tableInteractiveHeader(page)).toContainText(expressionName);
  });
});

test.describe("issue 62987", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await createQuestion(mb.api, {
      query: { "source-table": ORDERS_ID },
    });
    await visitQuestion(page, id);

    await openNotebook(page);
    await summarizeNotebook(page);
    await openCustomExpression(page);
  });

  test("should be possible to complete non-aggregation functions in custom aggregation (metabase#62987)", async ({
    page,
  }) => {
    await typeExpression(page, "Coun");
    await clickCompletion(customExpressionCompletion(page, "CountIf"));

    await typeInEditor(page, "notEm", { focus: false });
    await clickCompletion(customExpressionCompletion(page, "notEmpty"));

    await expectCustomExpressionValue(page, "CountIf(notEmpty(column))");

    await expressionEditorWidget(page)
      .getByRole("button", { name: "Function browser", exact: true })
      .click();
    const browser = functionBrowser(page);
    await expect(browser.getByText("CountIf", { exact: true })).toBeVisible();
    await expect(browser.getByText("notEmpty", { exact: true })).toBeVisible();
  });
});

test.describe("issue 63180", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        expressions: { Foo: ["+", 1, 2] },
      },
    });
    await visitQuestion(page, id);
    await openNotebook(page);
  });

  test("should not be possible to close the custom expression editor when creating a new expression from a combine or extract shortcut (metabase#63180)", async ({
    page,
  }) => {
    // The "click outside the editor" steps use dispatchClick: the expression
    // editor popover is portalled ON TOP of the notebook's data step, so a real
    // Playwright click is refused ("subtree intercepts pointer events") where
    // Cypress's dispatch-at-the-resolved-element reaches it. The app's own
    // handlers are target-based (a window-capture `click` listener in
    // CloseModal/utils.ts plus Mantine's mousedown click-outside), and the
    // second half of each block — where the widget MUST close — is what proves
    // the dispatch really drives the dismissal rather than doing nothing.
    async function testCombineColumns() {
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
      const widget = expressionEditorWidget(page);
      await widget.getByText("Combine columns", { exact: true }).click();
      const done = widget.getByRole("button", { name: "Done", exact: true });
      await done.scrollIntoViewIfNeeded();
      await done.click();

      // clicking outside the editor should not close it
      await dispatchClick(getNotebookStep(page, "data"));
      await expect(expressionEditorWidget(page)).toBeVisible();
      await expect(modal(page)).toHaveCount(0);

      // clearing the expression should allow clicking outside to work
      await clearEditor(page);
      // Gate on the clear having actually landed: the popover only lets an
      // outside click through once the expression is empty, and CodeMirror's
      // state update is a React render behind the keystroke. Cypress's command
      // queue supplied this settle; without it the outside click fires against
      // the still-dirty editor and the widget stays open (1 of 2 runs).
      await expectCustomExpressionValue(page, "");
      await dispatchClick(getNotebookStep(page, "data"));
      await expect(expressionEditorWidget(page)).toHaveCount(0);
      await expect(modal(page)).toHaveCount(0);
    }

    async function testExtractColumns() {
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
      const widget = expressionEditorWidget(page);
      await widget.getByText("Extract columns", { exact: true }).click();
      await widget.getByText("Email", { exact: true }).click();
      await widget.getByText("Domain", { exact: true }).click();

      // clicking outside the editor should not close it
      await dispatchClick(getNotebookStep(page, "data"));
      await expect(expressionEditorWidget(page)).toBeVisible();
      await expect(modal(page)).toHaveCount(0);

      // clearing the expression should allow clicking outside to work
      await clearEditor(page);
      // Gate on the clear having actually landed: the popover only lets an
      // outside click through once the expression is empty, and CodeMirror's
      // state update is a React render behind the keystroke. Cypress's command
      // queue supplied this settle; without it the outside click fires against
      // the still-dirty editor and the widget stays open (1 of 2 runs).
      await expectCustomExpressionValue(page, "");
      await dispatchClick(getNotebookStep(page, "data"));
      await expect(expressionEditorWidget(page)).toHaveCount(0);
      await expect(modal(page)).toHaveCount(0);
    }

    await testCombineColumns();
    await testExtractColumns();
  });
});
