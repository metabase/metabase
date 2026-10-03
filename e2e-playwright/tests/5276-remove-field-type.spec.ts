/**
 * Playwright port of
 * e2e/test/scenarios/onboarding/reference/reproductions/5276-remove-field-type.cy.spec.js
 *
 * issue #5276 — in the data reference (/reference/databases) a field's semantic
 * type can be cleared ("No semantic type") and the change persists.
 *
 * Port notes:
 * - cy.intercept("PUT", "/api/field/*").as("updateField") + cy.wait("@updateField")
 *   → page.waitForResponse (PUT /api/field/:id), registered before the Save click
 *   (PORTING rule 2).
 * - The unscoped cy.findByText(...) navigation links are exact testing-library
 *   string matches → getByText(..., { exact: true }) (rule 1).
 * - cy.button(/Edit/).trigger("click"): a *synthetic* click. The reference edit
 *   button is special-cased upstream (a real click enters edit mode and then
 *   immediately resets the form back out), so the original fires a bare synthetic
 *   click → dispatchEvent("click"), which runs only the React onClick like
 *   cy.trigger does.
 * - cy.findByDisplayValue("Score") targets the Mantine SemanticTypePicker <Select>
 *   showing the Rating field's "Score" semantic type → the shared
 *   getControlByDisplayValue (retried input/textarea/select scan).
 * - H.popover().findByText("No semantic type").click(): Mantine Select option rows
 *   aren't reliably clickable via their text div (wave-10 gotcha), so pick the
 *   role="option" inside the open dropdown. The option's accessible name includes
 *   its leading icon ("empty icon No semantic type"), so match as a substring
 *   (no `exact`) rather than the exact label.
 * - cy.findByDisplayValue("Score").should("not.exist") → expectNoDisplayValue.
 */
import { popover } from "../support/ui";
import { test } from "../support/fixtures";
import {
  expectNoDisplayValue,
  getControlByDisplayValue,
} from "../support/viz-tabular-repros";

test.describe("issue 5276", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow removing the field type (metabase#5276)", async ({
    page,
  }) => {
    await page.goto("/reference/databases");

    await page.getByText("Sample Database", { exact: true }).click();
    await page.getByText("Tables in Sample Database", { exact: true }).click();
    await page.getByText("Products", { exact: true }).click();
    await page.getByText("Fields in this table", { exact: true }).click();

    // A real click enters edit mode and immediately resets the form back out
    // (see the upstream TODO); a synthetic click avoids the reset.
    await page.getByRole("button", { name: /Edit/ }).dispatchEvent("click");

    await (await getControlByDisplayValue(page, "Score")).click();
    await popover(page)
      .getByRole("option", { name: "No semantic type" })
      .click();

    const updateField = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/field\/\d+$/.test(new URL(response.url()).pathname),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await updateField;

    await expectNoDisplayValue(page, "Score");
  });
});
