/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/drillthroughs/combine-column.cy.spec.ts
 *
 * The Combine-columns drill from a table COLUMN HEADER: click the header →
 * "Combine columns" click-action → pick columns + separators → a new combined
 * column is appended. Distinct from the "+" Add-column modal combine
 * (column-shortcuts.spec.ts).
 *
 * Notes:
 * - H.createQuestion(details, { visitQuestion: true }) → createQuestion(api) +
 *   visitQuestion(page, id).
 * - Snowplow helpers (resetSnowplow / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent) run real assertions, backed by the per-slot
 *   collector via ../support/snowplow. The combine flow itself still runs.
 * - The freshly-opened column dropdown is a second popover on top of the combine
 *   popover → popover(page).last() (precedent: column-shortcuts.ts selectColumn).
 * - cy.findAllByRole("textbox").last() / findByLabelText("Separator") →
 *   getByRole("textbox").last() scoped to the popover; fill() replaces the value
 *   (= Cypress .clear().type()).
 * - Test 2's `cy.findAllByTestId("header-cell").contains(str)` is cy.contains
 *   (case-sensitive substring, first hit) → filter({ hasText: regex }).first().
 */
import { test, expect } from "../support/fixtures";
import { createQuestion } from "../support/factories";
import {
  openCombineColumnsFromHeader,
  peopleIdEmailQuestionDetails,
} from "../support/combine-column-drill";
import { SAMPLE_DB_ID } from "../support/sample-data";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { caseSensitiveSubstring } from "../support/text";
import { popover, visitQuestion } from "../support/ui";

test.describe("scenarios > visualizations > drillthroughs > table_drills > combine columns", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should be possible to combine columns from the a table header", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, peopleIdEmailQuestionDetails);
    await visitQuestion(page, id);

    await openCombineColumnsFromHeader(page, "Email");

    await expect(popover(page).getByTestId("combine-example")).toContainText(
      "email@example.com12345",
    );
    // The second column select currently shows "ID" — click it to reopen its
    // dropdown.
    await popover(page).getByText("ID", { exact: true }).click();

    // A fresh dropdown popover opens on top of the combine popover.
    await popover(page).last().getByText("Name", { exact: true }).click();

    // Reveal the separator input for the first column pair.
    await popover(page).getByText("Separated by (empty)", { exact: true }).click();
    await popover(page).getByRole("textbox").last().fill("__");
    await expect(popover(page).getByTestId("combine-example")).toHaveText(
      "email@example.com__text",
    );

    await popover(page).getByText("Add column", { exact: true }).click();
    await expect(popover(page).getByTestId("combine-example")).toHaveText(
      "email@example.com__text__12345",
    );

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    await popover(page).getByRole("textbox").last().fill("");
    await expect(popover(page).getByTestId("combine-example")).toHaveText(
      "email@example.com__text12345",
    );

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    await popover(page).getByRole("textbox").last().fill("+");
    await expect(popover(page).getByTestId("combine-example")).toHaveText(
      "email@example.com__text+12345",
    );

    await popover(page).getByRole("button", { name: "Done", exact: true }).click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    await expect(page.getByTestId("header-cell").last()).toHaveText(
      "Combined Email, Name, ID",
    );

    await expectUnstructuredSnowplowEvent(mb, {
      event: "column_combine_via_column_header",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
    });
  });

  test("should handle duplicate column names", async ({ page, mb }) => {
    const { id } = await createQuestion(mb.api, peopleIdEmailQuestionDetails);
    await visitQuestion(page, id);

    // first combine (email + ID)
    await openCombineColumnsFromHeader(page, "Email");
    await popover(page).getByText("Done", { exact: true }).click();

    // second combine (email + ID)
    await openCombineColumnsFromHeader(page, "Email");
    await popover(page).getByText("Done", { exact: true }).click();

    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: caseSensitiveSubstring("Combined Email, ID") })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: caseSensitiveSubstring("Combined Email, ID_2") })
        .first(),
    ).toBeVisible();
  });
});
