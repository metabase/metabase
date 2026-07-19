/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/cc-shortcuts-combine.cy.spec.ts
 *
 * The "Combine columns" shortcut in the notebook custom-column / expression
 * flow: open the expression widget via H.addCustomColumn, pick the "Combine
 * columns" shortcut, choose columns, choose a separator, and create.
 *
 * Notes:
 * - Snowplow helpers (resetSnowplow / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent) are no-op stubs — no snowplow-micro
 *   container in the spike harness (PORTING.md rule 6). The final test still
 *   exercises the full UI; only the event assertion is stubbed away.
 * - H.CustomExpressionEditor.value().should("equal", …) → expectCustomExpressionValue.
 * - The Separator input is a plain HTML text input (not CodeMirror); it is
 *   empty by default whenever the test types into it (the combine-example
 *   asserts "__" with no leading space, i.e. no default separator was present),
 *   so real keystrokes via pressSequentially drive the debounced example update.
 * - selectColumn/selectCombineColumns/addColumn live in
 *   support/cc-shortcuts-combine.ts.
 */
import {
  addColumn,
  selectColumn,
  selectCombineColumns,
} from "../support/cc-shortcuts-combine";
import { expectCustomExpressionValue } from "../support/custom-column-3";
import { openTableNotebookWithLimit } from "../support/custom-column";
import { test, expect } from "../support/fixtures";
import { addCustomColumn, openTableNotebook } from "../support/joins";
import { expressionEditorWidget } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

// TODO: no snowplow-micro container in the spike harness — these mirror the
// H snowplow helpers as no-ops (PORTING.md rule 6).
const resetSnowplow = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

test.describe("scenarios > question > custom column > expression shortcuts > combine", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to select a combine columns shortcut", async ({
    page,
  }) => {
    await openTableNotebookWithLimit(page, ORDERS_ID, 5);
    await addCustomColumn(page);
    await selectCombineColumns(page);

    await selectColumn(page, 0, "Total");

    await expect(
      expressionEditorWidget(page).getByText("Total", { exact: true }),
    ).toBeVisible();

    await selectColumn(page, 1, "Product", "Rating");

    const widget = expressionEditorWidget(page);
    await expect(
      widget.getByText("Product → Rating", { exact: true }),
    ).toBeVisible();

    await expect(widget.getByTestId("combine-example")).toHaveText(
      "123.45678901234567 123.45678901234567",
    );

    await widget.getByText(/Separated by/).click();
    // The Separator input carries a default " " for number columns; Cypress's
    // .type("__") replaced it (result "__", no space), so fill (clear + set)
    // reproduces that end state — pressSequentially would insert "__" at caret 0
    // and leave "__ ".
    await widget.getByLabel("Separator", { exact: true }).fill("__");

    await expect(widget.getByTestId("combine-example")).toHaveText(
      "123.45678901234567__123.45678901234567",
    );

    await widget.getByRole("button", { name: "Done", exact: true }).click();

    await expectCustomExpressionValue(
      page,
      'concat([Total], "__", [Product → Rating])',
    );
    await expect(widget.getByTestId("expression-name")).toHaveValue(
      "Combined Total, Rating",
    );
  });

  test("should be possible to cancel when using the combine column shortcut", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);
    await addCustomColumn(page);
    await selectCombineColumns(page);

    await selectColumn(page, 0, "Total");
    await selectColumn(page, 1, "Product", "Rating");

    const widget = expressionEditorWidget(page);
    // Click the back button, in the header
    await widget.getByText("Select columns to combine", { exact: true }).click();

    await expectCustomExpressionValue(page, "");
    await expect(widget.getByTestId("expression-name")).toHaveValue("");
  });

  test("should be possible to add and remove more than one column", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);
    await addCustomColumn(page);
    await selectCombineColumns(page);

    await selectColumn(page, 0, "Total");
    await selectColumn(page, 1, "Product", "Rating");
    await addColumn(page);
    await selectColumn(page, 2, "User", "Email");

    await expect(page.getByTestId("combine-example")).toContainText(
      "123.45678901234567 123.45678901234567 email@example.com",
    );

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    await page.getByLabel("Remove column", { exact: true }).last().click();

    await expect(page.getByTestId("combine-example")).toContainText(
      "123.45678901234567 123.45678901234567",
    );
  });

  test("should pick the correct default separator based on the type of the first column", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);
    await addCustomColumn(page);
    await selectCombineColumns(page);

    await selectColumn(page, 0, "User", "Email");

    const widget = expressionEditorWidget(page);
    await expect(
      widget.getByText("Separated by (empty)", { exact: true }),
    ).toBeVisible();
    await widget.getByText(/Separated by/).click();

    await expect(widget.getByLabel("Separator", { exact: true })).toHaveValue("");
  });

  test("should be possible to edit a previous stages' columns when there is an aggregation (metabase#43226)", async ({
    page,
  }) => {
    await openTableNotebook(page, ORDERS_ID);

    await page.getByRole("button", { name: "Summarize", exact: true }).click();

    await popover(page).getByText("Count of rows", { exact: true }).click();

    // add custom column
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    await page
      .getByTestId("action-buttons")
      .first()
      .locator(".Icon-add_data")
      .click();
    await selectCombineColumns(page);

    await selectColumn(page, 0, "User", "Email");

    const widget = expressionEditorWidget(page);
    await expect(
      widget.getByText("Separated by (empty)", { exact: true }),
    ).toBeVisible();
    await widget.getByText(/Separated by/).click();

    await expect(widget.getByLabel("Separator", { exact: true })).toHaveValue("");
  });
});

test.describe("scenarios > question > custom column > combine shortcuts", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsNormalUser();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should send an event for combine columns", async ({ page }) => {
    await openTableNotebook(page, ORDERS_ID);
    await addCustomColumn(page);
    await selectCombineColumns(page);

    await selectColumn(page, 0, "User", "Email");
    await selectColumn(page, 1, "User", "Email");

    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await expectUnstructuredSnowplowEvent({
      event: "column_combine_via_shortcut",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
      question_id: 0,
    });
  });
});
