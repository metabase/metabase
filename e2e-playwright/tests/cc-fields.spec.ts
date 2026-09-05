/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/cc-fields.cy.spec.ts
 *
 * Field resolution in custom-column expressions: referencing a table/expression
 * column by name in a `[Column]` reference, resolved case-sensitively across
 * case-only-differing expression names (FOO/foo/Foo/FoO), and resolving a joined
 * field through both the `→` and `.` separators (and both case variants), with
 * the auto-formatter canonicalising every form to `[Product → Title]`.
 *
 * The expression editor is CodeMirror — entry goes through the shared
 * enterCustomColumnDetails / customExpressionEditorType (native keystrokes) and
 * readback through expectCustomExpressionValue. `H.CustomExpressionEditor.value()
 * .should("eq", …)` → expectCustomExpressionValue (retried).
 *
 * The `→` separator: upstream's codeMirrorHelpers.type() replaces `→` with `->`
 * (the editor expands it back); page.keyboard.type inserts the literal `→`
 * directly, so no replacement is needed.
 *
 * H.createQuestion({ visitQuestion: true }) → createQuestion + visitQuestion
 * (the factory only creates). The `.icon("close")` count / `.last()` idiom ports
 * to `.locator(".Icon-close")` toHaveCount / .last().
 */
import { addCustomColumn } from "../support/cc-fields";
import {
  clearCustomExpressionEditor,
  customExpressionEditorType,
  expectCustomExpressionValue,
  formatExpression,
} from "../support/custom-column-3";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { openTableNotebook } from "../support/joins";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

test.describe("scenarios > custom column > field resolution", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await openTableNotebook(page, ORDERS_ID);
  });

  test("should be possible to resolve fields in custom columns", async ({
    page,
    mb,
  }) => {
    const expressions: Record<string, ["value", string]> = {
      FOO: ["value", "upper"],
      foo: ["value", "lower"],
      Foo: ["value", "sentence"],
      FoO: ["value", "silly"],
    };

    const { id } = await createQuestion(mb.api, {
      query: {
        "source-table": ORDERS_ID,
        expressions,
        filter: ["=", ["field", ORDERS.ID, null], 1],
        limit: 1,
        fields: [["field", ORDERS.ID, null]],
      },
    });

    await visitQuestion(page, id);
    await openNotebook(page);

    for (const [name, expression] of Object.entries(expressions)) {
      const str = expression[1];
      await getNotebookStep(page, "expression").locator(".Icon-add").click();

      const expr = `[${name}]`;
      await enterCustomColumnDetails(page, { formula: expr, name: "Custom" });
      await formatExpression(page);
      await expectCustomExpressionValue(page, expr);
      await popover(page)
        .getByRole("button", { name: "Done", exact: true })
        .click();

      await visualize(page);
      await assertTableData(page, {
        columns: ["ID", "Custom"],
        firstRows: [["1", str]],
      });

      await openNotebook(page);
      const closeIcons = getNotebookStep(page, "expression").locator(
        ".Icon-close",
      );
      await expect(closeIcons).toHaveCount(6);
      await closeIcons.last().click();
    }
  });

  test("should be possible to resolve fields in using different separators", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);
    await addCustomColumn(page);

    for (const expr of [
      "[Product → Title]",
      "[Product.Title]",
      "[product → title]",
      "[product.title]",
    ]) {
      await customExpressionEditorType(page, expr);
      await formatExpression(page);
      await expectCustomExpressionValue(page, "[Product → Title]");
      await clearCustomExpressionEditor(page);
    }
  });
});
