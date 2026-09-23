/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/custom-column-2.cy.spec.js
 *
 * Notes on the port:
 * - The expression editor is CodeMirror. Formulas are typed with native
 *   keystrokes (support/custom-column-2 `enterCustomColumnDetails`, an
 *   escape-sequence-aware port of H.enterCustomColumnDetails; the shared
 *   support/notebook.ts one raw-types the formula and would emit a literal
 *   "{enter}"). Focus is asserted (`cm-focused`) before typing.
 * - `H.CustomExpressionEditor.blur()` clicks the widget's bottom-right corner
 *   upstream; ported as a DOM blur() on the CodeMirror content node — same
 *   blur handler, no parked mouse cursor. See support/custom-column-2.ts.
 * - `{enter}` inside a formula is a *completion accept*, not a newline (see
 *   metabase#15891 below): CodeMirror binds Enter to acceptCompletion while
 *   the suggestion tooltip is open. Cypress's command queue supplied the
 *   settle time; the port gates on the dropdown being visible.
 * - `cy.button(name)` → getByRole("button", { name, exact: true }).
 * - `cy.findByPlaceholderText(str)` / `findByText(str)` are testing-library
 *   EXACT matches → `{ exact: true }`.
 * - `cy.viewport(w, h)` → page.setViewportSize.
 *
 * Infra tier: only the first describe is `@external` (it restores the
 * `postgres-12` snapshot in beforeEach), gated on PW_QA_DB_ENABLED. Of its five
 * tests only "should understand date functions" actually queries QA Postgres12;
 * the other four use the H2 sample DB and are gated only because the shared
 * beforeEach restores the snapshot. Describes 2-5 need no container.
 *
 * Two upstream defects are ported verbatim and flagged inline:
 * - metabase#15891 says "Pressing `escape` key should also remove the popover"
 *   but calls blur() again — escape is never exercised.
 * - "exiting the editor" ends on `cy.get("popover")`, a <popover> TAG selector
 *   that can never match → that assertion is vacuous.
 */
import type { Page } from "@playwright/test";

import { openOrdersTable, openProductsTable } from "../support/ad-hoc-question";
import {
  blurExpressionEditor,
  completionOptions,
  enterCustomColumnDetails,
  helpText,
  helpTextHeader,
  selectCompletion,
  typeInExpressionEditor,
} from "../support/custom-column-2";
import { customExpressionEditor } from "../support/custom-column";
import { focusCustomExpressionEditor } from "../support/custom-column-3";
import { parkMouseAwayFromTooltips } from "../support/documents";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { filterNotebook, openTableNotebook } from "../support/joins";
import {
  expressionEditorWidget,
  getNotebookStep,
  miniPicker,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { modal, popover } from "../support/ui";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

/** Port of the spec-local addCustomColumns(). */
async function addCustomColumns(
  page: Page,
  columns: { name: string; formula: string }[],
) {
  for (const [index, column] of columns.entries()) {
    if (index) {
      // H.getNotebookStep("expression").icon("add").click()
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
    } else {
      // cy.findByLabelText("Custom column").click()
      await page.getByLabel("Custom column", { exact: true }).click();
    }

    await enterCustomColumnDetails(page, column);
    // cy.button("Done").click({ force: true }) — the widget is settled by the
    // time the name input has been blurred, so a plain click suffices.
    await page.getByRole("button", { name: "Done", exact: true }).click();
  }
}

/** Port of the spec-local openCustomColumnInTable(). */
async function openCustomColumnInTable(page: Page, table: number) {
  await openTableNotebook(page, table);
  await page.getByText("Custom column", { exact: true }).click();
}

test.describe("scenarios > question > custom column > data type", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "@external: restores the postgres-12 snapshot and drives QA Postgres12 (set PW_QA_DB_ENABLED)",
    );
    await mb.restore();
    await mb.restore("postgres-12");

    await mb.signInAsAdmin();
  });

  test("should understand string functions (metabase#13217)", async ({
    page,
  }) => {
    await openCustomColumnInTable(page, PRODUCTS_ID);

    await enterCustomColumnDetails(page, {
      formula: "concat([Category], [Title])",
      name: "CategoryTitle",
    });

    await page.getByRole("button", { name: "Done", exact: true }).click();

    await filterNotebook(page);

    const filterPopover = popover(page);
    await filterPopover.getByText("CategoryTitle", { exact: true }).click();
    // NOTE (faithful): upstream checks the absence of the numeric widget
    // BEFORE asserting the text widget is visible, so the absence check can be
    // satisfied while the picker is still rendering. Kept in upstream order;
    // the following visibility assertion is what actually pins the type.
    await expect(
      filterPopover.getByPlaceholder("Enter a number", { exact: true }),
    ).toHaveCount(0);
    await expect(
      filterPopover.getByPlaceholder("Enter some text", { exact: true }),
    ).toBeVisible();
  });

  test("should understand date functions", async ({ page }) => {
    await startNewQuestion(page);
    await miniPicker(page).getByText("QA Postgres12", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    await addCustomColumns(page, [
      { name: "Year", formula: "year([Created At])" },
      { name: "Quarter", formula: "quarter([Created At])" },
      { name: "Month", formula: "month([Created At])" },
      { name: "Week", formula: 'week([Created At], "iso")' },
      { name: "Day", formula: "day([Created At])" },
      { name: "Weekday", formula: "weekday([Created At])" },
      { name: "Hour", formula: "hour([Created At])" },
      { name: "Minute", formula: "minute([Created At])" },
      { name: "Second", formula: "second([Created At])" },
      {
        name: "Datetime Add",
        formula: 'datetimeAdd([Created At], 1, "month")',
      },
      {
        name: "Datetime Subtract",
        formula: 'datetimeSubtract([Created At], 1, "month")',
      },
      {
        name: "ConvertTimezone 3 args",
        formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh", "UTC")',
      },
      {
        name: "ConvertTimezone 2 args",
        formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh")',
      },
    ]);

    await visualize(page);
  });

  test("should relay the type of a date field", async ({ page }) => {
    await openCustomColumnInTable(page, PEOPLE_ID);

    await enterCustomColumnDetails(page, {
      formula: "[Birth Date]",
      name: "DoB",
    });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await filterNotebook(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("DoB", { exact: true }).click();
    await expect(
      filterPopover.getByPlaceholder("Enter a number", { exact: true }),
    ).toHaveCount(0);
    await filterPopover
      .getByText("Relative date range…", { exact: true })
      .click();
    await filterPopover.getByText("Previous", { exact: true }).click();
    await expect(await findByDisplayValue(filterPopover, "days")).toBeVisible();
  });

  test("should handle CASE (metabase#13122)", async ({ page }) => {
    await openCustomColumnInTable(page, ORDERS_ID);

    await enterCustomColumnDetails(page, {
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await filterNotebook(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("MiscDate", { exact: true }).click();
    await expect(
      filterPopover.getByPlaceholder("Enter a number", { exact: true }),
    ).toHaveCount(0);

    await filterPopover
      .getByText("Relative date range…", { exact: true })
      .click();
    await filterPopover.getByText("Previous", { exact: true }).click();
    await expect(await findByDisplayValue(filterPopover, "days")).toBeVisible();
  });

  test("should handle COALESCE", async ({ page }) => {
    await openCustomColumnInTable(page, ORDERS_ID);

    await enterCustomColumnDetails(page, {
      formula: "COALESCE([Product → Created At], [Created At])",
      name: "MiscDate",
    });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await filterNotebook(page);
    const filterPopover = popover(page);
    await filterPopover.getByText("MiscDate", { exact: true }).click();
    await expect(
      filterPopover.getByPlaceholder("Enter a number", { exact: true }),
    ).toHaveCount(0);
    await filterPopover
      .getByText("Relative date range…", { exact: true })
      .click();
    await filterPopover.getByText("Previous", { exact: true }).click();
    await expect(await findByDisplayValue(filterPopover, "days")).toBeVisible();
  });
});

test.describe("scenarios > question > custom column > error feedback", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await openProductsTable(page, { mode: "notebook" });
    await page.getByText("Custom column", { exact: true }).click();
  });

  test("should catch non-existent field reference", async ({ page }) => {
    await enterCustomColumnDetails(page, {
      formula: "abcdef",
      name: "Non-existent",
    });

    // cy.contains(/^Unknown column: abcdef/i) — a bare cy.contains asserts
    // existence of *some* element whose text matches; ported as first-match
    // presence (cy.contains yields the first/deepest hit).
    await expect(
      page.getByText(/^Unknown column: abcdef/i).first(),
    ).toBeAttached();
  });

  test("should fail on expression validation errors", async ({ page }) => {
    await enterCustomColumnDetails(page, {
      formula: "SUBSTRING('foo', 0, 1)",
      name: "BadSubstring",
    });

    await expect(page.getByText(/positive integer/i).first()).toBeAttached();
  });
});

// ExpressionEditorTextfield jsx component
test.describe("scenarios > question > custom column > expression editor", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // This is the default screen size but we need it explicitly set for this
    // test because of the resize later on
    await page.setViewportSize({ width: 1280, height: 800 });

    await openOrdersTable(page, { mode: "notebook" });
    await page.getByText("Custom column", { exact: true }).click();

    await enterCustomColumnDetails(page, {
      // Formula was intentionally written without spaces (important for this repro)!
      formula: "1+1",
      name: "Math",
    });
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
  });

  test("should not accidentally delete Custom Column formula value and/or Custom Column name (metabase#15734)", async ({
    page,
  }) => {
    await typeInExpressionEditor(
      page,
      "{movetoend}{leftarrow}{movetostart}{rightarrow}{rightarrow}",
    );
    await (await findByDisplayValue(page.locator("body"), "Math")).focus();
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
  });

  test("should not erase Custom column formula and Custom column name when expression is incomplete (metabase#16126)", async ({
    page,
  }) => {
    await typeInExpressionEditor(page, "{movetoend}{backspace}");
    await blurExpressionEditor(page);

    await expect(
      page.getByText("Expected expression", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
  });

  test("should not erase Custom Column formula and Custom Column name on window resize (metabase#16127)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1260, height: 800 });
    await expect(
      await findByDisplayValue(page.locator("body"), "Math"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
  });
});

test.describe("scenarios > question > custom column > help text", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await openProductsTable(page, { mode: "notebook" });
    await page.getByText("Custom column", { exact: true }).click();
  });

  test("should appear while inside a function", async ({ page }) => {
    await enterCustomColumnDetails(page, { formula: "lower(", blur: false });
    await expect(helpTextHeader(page)).toBeVisible();
    await expect(helpTextHeader(page)).toContainText("lower(value)");
  });

  test("should appear after a field reference", async ({ page }) => {
    await enterCustomColumnDetails(page, {
      formula: "lower([Category]",
      blur: false,
    });
    await expect(helpTextHeader(page)).toBeVisible();
    await expect(helpTextHeader(page)).toContainText("lower(value)");
  });

  test("should not appear while outside a function", async ({ page }) => {
    await enterCustomColumnDetails(page, {
      formula: "lower([Category])",
      blur: false,
    });
    await expect(helpTextHeader(page)).toHaveCount(0);
  });

  test("should not appear when formula field is not in focus (metabase#15891)", async ({
    page,
  }) => {
    // "rou{enter}" — the Enter ACCEPTS the `round` completion (CodeMirror binds
    // Enter to acceptCompletion while the tooltip is open); it is not a newline.
    await enterCustomColumnDetails(page, {
      formula: "rou{enter}1.5{leftArrow}",
      blur: false,
      awaitCompletionsBeforeEnter: true,
    });

    await expect(helpText(page)).toBeVisible();
    await expect(helpText(page)).toContainText("round([Temperature])");

    // Blur event should remove the expression helper popover
    await blurExpressionEditor(page);
    await expect(helpText(page)).toHaveCount(0);

    await focusCustomExpressionEditor(page);
    await typeInExpressionEditor(page, "{leftArrow}", { focus: false });
    await expect(helpText(page)).toBeVisible();
    await expect(helpText(page)).toContainText("round([Temperature])");

    // UPSTREAM DEFECT (ported verbatim): the cy.log says "Pressing `escape` key
    // should also remove the expression helper popover", but the code blurs
    // again. Escape is never exercised by this test.
    await blurExpressionEditor(page);
    await expect(helpText(page)).toHaveCount(0);
  });

  test("should not disappear when clicked on (metabase#17548)", async ({
    page,
  }) => {
    await enterCustomColumnDetails(page, { formula: "round(", blur: false });

    await expect(helpText(page)).toBeVisible();
    await expect(helpText(page)).toContainText("round([Temperature])");

    // Shouldn't hide on click
    await helpText(page).click();

    await expect(helpText(page)).toBeVisible();
    await expect(helpText(page)).toContainText("round([Temperature])");
  });

  test.describe(
    "scenarios > question > custom column > help text > visibility",
    () => {
      test.beforeEach(async ({ page }) => {
        await enterCustomColumnDetails(page, {
          formula: "round(",
          blur: false,
        });
      });

      test("should be possible to show and hide the help text when there are no suggestions", async ({
        page,
      }) => {
        await assertHelpTextIsVisible(page);

        await helpTextHeader(page).click();
        await assertNeitherAreVisible(page);

        await helpTextHeader(page).click();
        await assertHelpTextIsVisible(page);
      });

      test("should show the help text again when the suggestions are closed", async ({
        page,
      }) => {
        await typeInExpressionEditor(page, "[Rat", { focus: false });

        // suggestions should be visible
        await assertSuggestionsAreVisible(page);

        // help text should re-open when suggestion is picked
        await selectCompletion(page, "Rating");
        await assertHelpTextIsVisible(page);
      });

      test("should be possible to close the help text", async ({ page }) => {
        // hide help text by clicking the header
        await helpTextHeader(page).click();
        await assertNeitherAreVisible(page);

        // type to see suggestions
        await typeInExpressionEditor(page, "[Rat", { focus: false });
        await assertSuggestionsAreVisible(page);

        // help text should remain hidden after selecting a suggestion
        await selectCompletion(page, "Rating");
        await assertNeitherAreVisible(page);
      });

      test("should be possible to prefer showing the help text over the suggestions", async ({
        page,
      }) => {
        // type to see suggestions
        await typeInExpressionEditor(page, "[Rat", { focus: false });
        await assertSuggestionsAreVisible(page);

        // show help text by clicking the header
        await helpTextHeader(page).click();
        await assertHelpTextIsVisible(page);

        // help text should remain shown after finishing typing
        await typeInExpressionEditor(page, "ing], ", { focus: false });
        await assertHelpTextIsVisible(page);
      });

      test("should be possible to prefer showing the suggestion when typing", async ({
        page,
      }) => {
        // type to see suggestions
        await typeInExpressionEditor(page, "[Rat", { focus: false });
        await assertSuggestionsAreVisible(page);

        // show help text by clicking the header
        await helpTextHeader(page).click();
        await assertHelpTextIsVisible(page);

        // show suggestions again by clicking the header
        await helpTextHeader(page).click();
        await assertSuggestionsAreVisible(page);

        // UPSTREAM MISMATCH (ported verbatim): the cy.log reads "help text
        // should remain shown after finishing typing" but the assertion is
        // that NEITHER is shown.
        await typeInExpressionEditor(page, "ing], ", { focus: false });
        await assertNeitherAreVisible(page);
      });

      // `should("be.visible")` on findAllByRole is an ANY-of-set assertion.
      async function assertSuggestionsAreVisible(page: Page) {
        await expect(helpText(page)).toHaveCount(0);
        await expect(
          completionOptions(page).filter({ visible: true }).first(),
        ).toBeVisible();
      }
      async function assertHelpTextIsVisible(page: Page) {
        await expect(helpText(page)).toBeVisible();
        await expect(completionOptions(page)).toHaveCount(0);
      }
      async function assertNeitherAreVisible(page: Page) {
        await expect(helpText(page)).toHaveCount(0);
        await expect(completionOptions(page)).toHaveCount(0);
      }
    },
  );
});

test.describe("scenarios > question > custom column > exiting the editor", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Restore Cypress's viewport (e2e/support/config.js: 1280x800). This
    // harness's playwright.config.ts declares the same 1280x800 at the top
    // level, but the `chromium` project spreads devices["Desktop Chrome"],
    // whose 1280x720 wins — so every port actually runs 80px shorter than
    // upstream. It matters here and only here: at 720 the expression-editor
    // popover flips ABOVE its anchor (measured y=26, h=326) and covers the
    // data step's "Pick columns" button (y=193), so the click is intercepted
    // by the CodeMirror content node; at 800 the popover opens below (y=402)
    // and the click lands. Purely a layout artefact of the shorter viewport.
    await page.setViewportSize({ width: 1280, height: 800 });

    await openProductsTable(page, { mode: "notebook" });
    await page.getByText("Custom column", { exact: true }).click();
  });

  test("should be possible to close the custom expression editor by pressing Escape when it is empty", async ({
    page,
  }) => {
    // Park the real cursor: Playwright's click leaves it over the notebook
    // action button, whose tooltip would swallow the Escape (floating-ui's
    // useDismiss stops propagation) — Cypress's synthetic click never moves it.
    await parkMouseAwayFromTooltips(page);
    await page.keyboard.press("Escape");
    await expect(customExpressionEditor(page)).toHaveCount(0);
  });

  test("should not be possible to close the custom expression editor by pressing Escape when it is not empty", async ({
    page,
  }) => {
    await typeInExpressionEditor(page, "count(");
    await parkMouseAwayFromTooltips(page);
    await page.keyboard.press("Escape");
    await expect(customExpressionEditor(page)).toBeVisible();
  });

  test("should be possible to exit the editor by clicking outside of it when there is no text", async ({
    page,
  }) => {
    await getNotebookStep(page, "data").click();
    await expect(modal(page)).toHaveCount(0);
    await expect(expressionEditorWidget(page)).toHaveCount(0);
  });

  test("should be possible to exit the editor by clicking outside of it when there is no text, by clicking an interactive element", async ({
    page,
  }) => {
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await expect(modal(page)).toHaveCount(0);
    await expect(expressionEditorWidget(page)).toHaveCount(0);
    await expect(
      popover(page).getByText("Select all", { exact: true }),
    ).toBeVisible();
  });

  test("should not be possible to exit the editor by clicking outside of it when there is an unsaved expression", async ({
    page,
  }) => {
    await enterCustomColumnDetails(page, { formula: "1+1", blur: false });
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await expect(
      popover(page).getByText("Select all", { exact: true }),
    ).toHaveCount(0);
    await expect(expressionEditorWidget(page)).toHaveCount(1);

    const confirm = modal(page);
    await expect(
      confirm.getByText("Keep editing your custom expression?", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      confirm.getByRole("button", { name: "Discard changes", exact: true }),
    ).toBeEnabled();
    await confirm
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();

    await expect(modal(page)).toHaveCount(0);
    await expect(expressionEditorWidget(page)).toHaveCount(1);
  });

  test("should be possible to discard changes when clicking outside of the editor", async ({
    page,
  }) => {
    await enterCustomColumnDetails(page, { formula: "1+1", blur: false });
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns", exact: true })
      .click();
    await expect(expressionEditorWidget(page)).toHaveCount(1);
    await expect(
      popover(page).getByText("Select all", { exact: true }),
    ).toHaveCount(0);

    const confirm = modal(page);
    await expect(
      confirm.getByText("Keep editing your custom expression?", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      confirm.getByRole("button", { name: "Keep editing", exact: true }),
    ).toBeEnabled();
    await confirm
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();

    await expect(modal(page)).toHaveCount(0);
    await expect(expressionEditorWidget(page)).toHaveCount(0);
  });

  test("should be possible to discard changes by clicking cancel button", async ({
    page,
  }) => {
    await enterCustomColumnDetails(page, { formula: "1+1", name: "OK" });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(modal(page)).toHaveCount(0);
    await expect(expressionEditorWidget(page)).toHaveCount(0);
    await expect(
      getNotebookStep(page, "expression").getByText("OK", { exact: true }),
    ).toHaveCount(0);
  });

  test("should be possible to close the popover when navigating away from the expression editor", async ({
    page,
  }) => {
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.getByRole("button", { name: "Summarize", exact: true }).click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "1+1" });

    // Go back to summarize modal
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    // Close summarize modal by clicking outside
    await page.getByLabel("View SQL", { exact: true }).click();

    await expect(modal(page)).toHaveCount(0);
    // UPSTREAM DEFECT (ported verbatim): `cy.get("popover")` is a TAG selector
    // for a nonexistent <popover> element, so this assertion is VACUOUS — it
    // can never fail, and in particular it does not check H.popover().
    await expect(page.locator("popover")).toHaveCount(0);
  });
});
