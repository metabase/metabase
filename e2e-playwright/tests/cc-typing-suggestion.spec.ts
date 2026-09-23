/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/cc-typing-suggestion.cy.spec.js
 *
 * Autocomplete + help-text behaviour of the custom-column CodeMirror expression
 * editor: field/function suggestions, accepting a suggestion (field, function
 * template, no-arg template), the function help-text popover (show / collapse /
 * follow-the-cursor / mode-support / space-constrained collapse), and the
 * snippet-still-active error suppression.
 *
 * The editor is CodeMirror, so real keystrokes drive it (page.keyboard IS CDP
 * input, the equivalent of upstream cy.realType). See support/cc-typing-suggestion.ts
 * for the escape-aware type()/enterCustomColumnDetails and the help-text helpers;
 * the completions()/completion()/value() ports are reused read-only from
 * custom-column-3.ts.
 *
 * Fidelity note: test 11's first typeExpression uses focus:true where upstream
 * uses focus:false — behaviourally identical on the empty editor (caret at 0),
 * but it asserts CodeMirror actually took focus before page.keyboard types
 * (which has no retry, unlike cy.type).
 */
import {
  customExpressionCompletion,
  customExpressionCompletions,
  expectCustomExpressionValue,
} from "../support/custom-column-3";
import { customExpressionEditor } from "../support/custom-column";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { openTableNotebook, summarizeNotebook } from "../support/joins";
import { getNotebookStep, openNotebook } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";
import {
  acceptCompletion,
  addCustomColumn,
  completionsListbox,
  enterCustomColumnDetails,
  helpText,
  helpTextHeader,
  typeExpression,
  verifyHelptextPosition,
} from "../support/cc-typing-suggestion";

const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > question > custom column > typing suggestion", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await openTableNotebook(page, PRODUCTS_ID);
  });

  test("should not suggest arithmetic operators", async ({ page }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "[Price] " });
    await expect(page.getByTestId("expression-suggestions-list")).toHaveCount(0);
  });

  test("should correctly accept the chosen field suggestion", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, {
      formula:
        "[Rating]{leftarrow}{leftarrow}{leftarrow}{backspace}{backspace}t",
      blur: false,
    });

    // accept the only suggested item, i.e. "[Rating]"
    await acceptCompletion(page);

    // if the replacement is correct -> "[Rating]"
    // if the replacement is wrong -> "[Rating] ng"
    await expectCustomExpressionValue(page, "[Rating]");
  });

  test("should correctly accept the chosen function suggestion", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "le", blur: false });

    await acceptCompletion(page);

    await expect(helpText(page)).toBeVisible();
    await expect(helpText(page)).toContainText("length([Comment])");
  });

  test("should correctly insert function suggestion with the template", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "bet", blur: false });
    await acceptCompletion(page);
    await expectCustomExpressionValue(page, "between(column, start, end)");
  });

  test("should correctly insert function suggestion with the template when it has no arguments", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "now", blur: false });
    await acceptCompletion(page);
    await expectCustomExpressionValue(page, "now()");
  });

  test("should show expression function helper if a proper function is typed", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "lower(", blur: false });

    await expect(helpTextHeader(page)).toBeVisible();
    await expect(helpTextHeader(page)).toContainText("lower(value)");

    await expect(helpText(page)).toBeVisible();
    await expect(
      helpText(page).getByText(
        "Returns the string of text in all lower case.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      helpText(page).getByText(
        "The column with values to convert to lower case.",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("should not show suggestions for an unfocused field (metabase#31643)", async ({
    page,
  }) => {
    await summarizeNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "Count{enter}", blur: true });
    await expect(customExpressionCompletions(page)).toHaveCount(0);
  });

  test("should always show the help text popover on top of the custom expression widget (metabase#52711)", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "concat(", blur: false });

    /**
     * Upstream note: cypress considers the help-text popover visible even when
     * under its parent popover (it's in a portal, so not clipped), but refuses
     * to click "Learn more" because it's covered. The (hacky) test clicks the
     * popover's elements and checks the popover survives — a popover has
     * onClickOutside behaviour, so it would close if a click landed outside it.
     */
    await helpText(page)
      .getByText("Combine two or more strings of text together.", {
        exact: true,
      })
      .click();
    await helpText(page).getByText("Example", { exact: true }).click();

    // Trigger the "covered element" path without actually clicking the external
    // link (upstream .trigger("mousemove") → hover).
    await helpText(page).getByText("Learn more", { exact: true }).hover();

    await expect(helpText(page)).toBeVisible();
  });

  test("should be possible to collapse the help text popover", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "concat(", blur: false });

    await expect(helpText(page)).toBeVisible();
    await helpTextHeader(page).click();
    await expect(helpText(page)).toHaveCount(0);
    await helpTextHeader(page).click();
    await expect(helpText(page)).toBeVisible();
  });

  test("the help text popover should collapse when there is not enough space to render it and the completions", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await enterCustomColumnDetails(page, { formula: "concat(", blur: false });
    await page.setViewportSize({ width: 1280, height: 700 });

    await expect(helpText(page)).toBeVisible();

    await typeExpression(page, "[", { focus: false });
    await expect(completionsListbox(page)).toBeVisible();
    await expect(helpText(page)).toHaveCount(0);

    await helpTextHeader(page).click();
    await expect(helpText(page)).toBeVisible();
    await expect(completionsListbox(page)).not.toBeVisible();

    await typeExpression(page, "I", { focus: false });
    await expect(helpText(page)).toHaveCount(0);
    await expect(completionsListbox(page)).toBeVisible();
  });

  test("the help text popover should follow the cursor position", async ({
    page,
  }) => {
    await addCustomColumn(page);

    await typeExpression(page, 'contains("foo"', { focus: true });
    await verifyHelptextPosition(page, '"foo"');

    await typeExpression(page, ', "bar"', { focus: false });
    await verifyHelptextPosition(page, '"bar"');

    await typeExpression(page, ', "baz"', { focus: false });
    await verifyHelptextPosition(page, '"baz"');

    // move cursor into baz
    await typeExpression(page, "{leftarrow}".repeat(3), { focus: false });
    await verifyHelptextPosition(page, '"baz"');

    // move cursor to bar
    await typeExpression(page, "{leftarrow}".repeat(5), { focus: false });
    await verifyHelptextPosition(page, '"bar"');

    // move cursor to foo
    await typeExpression(page, "{leftarrow}".repeat(10), { focus: false });
    await verifyHelptextPosition(page, '"foo"');

    // move cursor to contains(, right after (
    await typeExpression(page, "{leftarrow}".repeat(1), { focus: false });
    await verifyHelptextPosition(page, "contains");

    // move cursor to contains(, right before (
    await typeExpression(page, "{leftarrow}".repeat(1), { focus: false });
    await verifyHelptextPosition(page, "contains");

    // move cursor into contains
    await typeExpression(page, "{leftarrow}".repeat(2), { focus: false });
    await verifyHelptextPosition(page, "contains");

    // move cursor to bar using the mouse
    await customExpressionEditor(page).getByText('"bar"', { exact: true }).click();
    await verifyHelptextPosition(page, '"bar"');

    // move cursor to foo using the mouse
    await customExpressionEditor(page).getByText('"foo"', { exact: true }).click();
    await verifyHelptextPosition(page, '"foo"');

    // move cursor to baz using the mouse
    await customExpressionEditor(page).getByText('"baz"', { exact: true }).click();
    await verifyHelptextPosition(page, '"baz"');
  });

  test("should not show helptext for functions that are not supported by the expression mode", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await typeExpression(page, "Average([Price]){leftarrow}{leftarrow}");
    await expect(helpText(page)).toHaveCount(0);
  });

  test("should not show an error when a snippet is still active", async ({
    page,
  }) => {
    await addCustomColumn(page);
    await typeExpression(page, "conca{tab}", { delay: 50 });
    await expect(
      popover(page).getByText(/Unknown column/),
    ).toHaveCount(0);
    await typeExpression(page, "{tab}", { focus: false, delay: 50 });
    await expect(popover(page).getByText(/Unknown column/)).toBeVisible();
  });

  test("should be possible to complete a custom column that is just a rename of another custom column", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          Foo: ["+", 1, 1],
          Bar: [
            "expression",
            "Foo",
            {
              "base-type": "type/Integer",
            },
          ],
        },
      },
    });
    await visitQuestion(page, id);
    await openNotebook(page);

    await getNotebookStep(page, "expression").locator(".Icon-add").click();
    await typeExpression(page, "[Ba");
    await expect(customExpressionCompletion(page, "Bar")).toBeVisible();
  });

  test("should be possible to complete an aggregation that is just a rename of another aggregation", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL, null]],
            {
              name: "Foo",
              "display-name": "Foo",
            },
          ],
          [
            "aggregation-options",
            ["aggregation", 0],
            {
              name: "Bar",
              "display-name": "Bar",
            },
          ],
        ],
      },
    });
    await visitQuestion(page, id);
    await openNotebook(page);

    await getNotebookStep(page, "summarize").locator(".Icon-add").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await typeExpression(page, "[Ba");
    await expect(customExpressionCompletion(page, "Bar")).toBeVisible();
  });
});
