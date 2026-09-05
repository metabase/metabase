/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/sql-filters.cy.spec.js
 *
 * SQL template-tag filters: {{var}} text / number / date variables, the
 * "required" toggle + default-value interplay, widget rendering on desktop and
 * mobile, and multi-value text/number variables across the query builder,
 * saved, public and embedded question flows.
 *
 * Porting notes:
 * - The SQLFilter.* helper surface (openTypePickerFromDefaultFilterType,
 *   chooseType, toggleRequired, getRunQueryButton, getSaveQueryButton, runQuery)
 *   is already ported in support/native-filters.ts; setWidgetValue /
 *   setDefaultValue are the two new helpers, in support/sql-filters.ts.
 * - enterParameterizedQuery → typeInNativeEditor (CodeMirror auto-closes `{{`;
 *   typing the closing braces overtypes, matching the Cypress realType path —
 *   the sql-filters-source precedent types `{{tag}}` the same way).
 * - runQuery waits on POST /api/dataset (the ad-hoc "@dataset" alias); the
 *   describe-level `cy.intercept("api/dataset").as("dataset")` is folded into it.
 * - `invoke("val", "")` sets the input value without dispatching React events —
 *   ported as an evaluate that assigns `el.value = ""`.
 * - `{selectAll}{backspace}` → ControlOrMeta+a, Backspace. `.type()` after
 *   pre-filled content: press End first so appended text lands at the end, not
 *   position 0 (PORTING gotcha).
 * - `should("not.have.attr", "disabled")` on the Save <button> → one-arg
 *   not.toHaveAttribute("disabled").
 * - findAllByText(x).should("have.length.gte", 1) → the first match is visible;
 *   findAllByText(x).should("not.exist") → toHaveCount(0).
 * - The @skip-tagged flaky test (#19454) is ported as test.skip, faithfully.
 * - public / static-embedding are both enabled by the default snapshot
 *   (enable-public-sharing, enable-embedding-static + embedding-secret-key), so
 *   the multiple-values flows run on the jar without extra setup.
 */
import type { Page } from "@playwright/test";

import { filterWidget } from "../support/dashboard";
import { setSingleDate } from "../support/dashboard-filters-date";
import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { tableInteractive } from "../support/models";
import { typeInNativeEditor } from "../support/native-editor";
import {
  chooseType,
  getRunQueryButton,
  getSaveQueryButton,
  multiAutocompleteInput,
  openTypePickerFromDefaultFilterType,
  runQuery,
  toggleRequired,
} from "../support/native-filters";
import { startNewNativeQuestion } from "../support/native-editor";
import {
  rightSidebar,
  visitEmbeddedPage,
} from "../support/question-saved";
import { visitPublicQuestion } from "../support/sharing";
import { setDefaultValue, setWidgetValue } from "../support/sql-filters";
import { icon, popover, visitQuestion } from "../support/ui";

test.describe("scenarios > filters > sql filters > basic filter types", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await startNewNativeQuestion(page);
  });

  test.describe("should work for text", () => {
    test.beforeEach(async ({ page }) => {
      await typeInNativeEditor(
        page,
        "SELECT * FROM products WHERE products.category = {{textFilter}}",
      );
    });

    test("when set through the filter widget", async ({ page }) => {
      await setWidgetValue(page, "Gizmo");

      await runQuery(page);

      const viz = page.getByTestId("query-visualization-root");
      await expect(
        viz.getByText("Rustic Paper Wallet", { exact: true }),
      ).toBeVisible();
      await expect(viz.getByText("Doohickey", { exact: true })).toHaveCount(0);
    });

    test.describe("required tag", () => {
      test("does not need a default value to run and save the query", async ({
        page,
      }) => {
        await toggleRequired(page);
        await expect(getRunQueryButton(page)).toBeEnabled();
        await expect(getSaveQueryButton(page)).not.toHaveAttribute("disabled");
      });

      test("when there's a default value, enabling required sets it as a parameter value", async ({
        page,
      }) => {
        await setDefaultValue(page, "New value");
        await filterWidget(page)
          .locator("input")
          .first()
          .evaluate((el: HTMLInputElement) => {
            el.value = "";
          });
        await toggleRequired(page);
        await expect(filterWidget(page).locator("input").first()).toHaveValue(
          "New value",
        );
      });

      test("when there's a default value and input is empty, blur sets default value back", async ({
        page,
      }) => {
        await setDefaultValue(page, "default");
        await toggleRequired(page);
        const input = filterWidget(page).locator("input").first();
        await input.click();
        await input.press("ControlOrMeta+a");
        await input.press("Backspace");
        await expect(input).toHaveValue("");
        await input.blur();
        await expect(input).toHaveValue("default");
      });

      test("when there's a default value and template tag is required, can reset it back", async ({
        page,
      }) => {
        await setDefaultValue(page, "default");
        await toggleRequired(page);
        const input = filterWidget(page).locator("input").first();
        await input.click();
        await input.press("End");
        await input.pressSequentially("abc");
        await expect(input).toHaveValue("defaultabc");
        await icon(page, "revert").click();
        await expect(input).toHaveValue("default");
      });
    });
  });

  test.describe("should work for number", () => {
    test.beforeEach(async ({ page }) => {
      await typeInNativeEditor(
        page,
        "SELECT * FROM products WHERE products.rating = {{numberFilter}}",
      );

      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Number");
    });

    test("when set through the filter widget", async ({ page }) => {
      await setWidgetValue(page, "4.3");

      await runQuery(page);

      const viz = page.getByTestId("query-visualization-root");
      await expect(
        viz.getByText("Aerodynamic Linen Coat", { exact: true }),
      ).toBeVisible();
      await expect(viz.getByText("4.3", { exact: true }).first()).toBeVisible();
    });

    test.describe("required tag", () => {
      test("does not need a default value to run and save the query", async ({
        page,
      }) => {
        await toggleRequired(page);
        await expect(getRunQueryButton(page)).toBeEnabled();
        await expect(getSaveQueryButton(page)).not.toHaveAttribute("disabled");
      });

      test("when there's a default value, enabling required sets it as a parameter value", async ({
        page,
      }) => {
        await setDefaultValue(page, "3");
        await filterWidget(page)
          .locator("input")
          .first()
          .evaluate((el: HTMLInputElement) => {
            el.value = "";
          });
        await toggleRequired(page);
        await expect(filterWidget(page).locator("input").first()).toHaveValue(
          "3",
        );
      });

      test("when there's a default value and input is empty, blur sets default value back", async ({
        page,
      }) => {
        await setDefaultValue(page, "3");
        await toggleRequired(page);
        const input = filterWidget(page).locator("input").first();
        await input.click();
        await input.press("ControlOrMeta+a");
        await input.press("Backspace");
        await expect(input).toHaveValue("");
        await input.blur();
        await expect(input).toHaveValue("3");
      });

      test("when there's a default value and template tag is required, can reset it back", async ({
        page,
      }) => {
        await setDefaultValue(page, "3");
        await toggleRequired(page);
        const input = filterWidget(page).locator("input").first();
        await input.click();
        await input.press("End");
        await input.pressSequentially(".11");
        await expect(input).toHaveValue("3.11");
        await icon(page, "revert").click();
        await expect(input).toHaveValue("3");
      });
    });
  });

  test.describe("should work for date", () => {
    test.beforeEach(async ({ page }) => {
      await typeInNativeEditor(
        page,
        "SELECT * FROM products WHERE products.created_at = {{dateFilter}}",
      );

      await openTypePickerFromDefaultFilterType(page);
      await chooseType(page, "Date");
    });

    test("when set through the filter widget", async ({ page }) => {
      await filterWidget(page).click();
      // Since we have fixed dates in Sample Database (dating back a couple of
      // years), it'd be cumbersome to click back month by month. Instead, pick
      // the 15th of the current month and assert there are no results.

      await popover(page).getByText("15", { exact: true }).click();
      await popover(page).getByText("Add filter", { exact: true }).click();

      await runQuery(page);

      await expect(
        page
          .getByTestId("query-visualization-root")
          .getByText("No results", { exact: true }),
      ).toBeVisible();
    });

    async function setDefaultDate(
      page: Page,
      { year = "2024", month = "01", day = "22" } = {},
    ) {
      await page
        .getByTestId("sidebar-content")
        .getByText("Select a default value…", { exact: true })
        .click();
      await setSingleDate(page, `${month}/${day}/${year}`);
      await popover(page).getByText("Add filter", { exact: true }).click();
    }

    test.describe("required tag", () => {
      test("does not need a default value to run and save the query", async ({
        page,
      }) => {
        await toggleRequired(page);
        await expect(getRunQueryButton(page)).toBeEnabled();
        await expect(getSaveQueryButton(page)).not.toHaveAttribute("disabled");
      });

      test("when there's a default value, enabling required sets it as a parameter value", async ({
        page,
      }) => {
        await setDefaultDate(page, { year: "2026", month: "11", day: "01" });
        await filterWidget(page).hover();
        await icon(filterWidget(page), "close").click();
        await toggleRequired(page);
        await expect(filterWidget(page)).toContainText("November 1, 2026");
      });

      test("when there's a default value and template tag is required, can reset it back", async ({
        page,
      }) => {
        await setDefaultDate(page, { year: "2026", month: "11", day: "01" });
        await toggleRequired(page);
        await filterWidget(page).click();
        await popover(page).getByText("15", { exact: true }).click();
        await popover(page).getByText("Update filter", { exact: true }).click();
        await filterWidget(page).hover();
        await icon(filterWidget(page), "revert").click();
        await expect(filterWidget(page)).toContainText("November 1, 2026");
      });
    });
  });

  test("displays parameter field on desktop and mobile", async ({ page }) => {
    await typeInNativeEditor(
      page,
      "SELECT * FROM products WHERE products.category = {{testingparamvisbility77}}",
    );

    await setWidgetValue(page, "Gizmo");
    await runQuery(page);

    await expect(
      filterWidget(page).getByPlaceholder("Testingparamvisbility77"),
    ).toBeVisible();

    // close sidebar
    await icon(rightSidebar(page), "close").click();

    await icon(page, "contract").click();

    // resize window to mobile form factor
    await page.setViewportSize({ width: 480, height: 800 });

    await page.getByText("1 active filter", { exact: true }).click();

    await expect(
      filterWidget(page).getByPlaceholder("Testingparamvisbility77"),
    ).toBeVisible();
  });

  // flaky test (#19454)
  test.skip("should show an info popover when hovering over fields in the field filter field picker", async ({
    page,
  }) => {
    await typeInNativeEditor(page, "SELECT * FROM products WHERE {{cat}}");

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Field Filter");

    await popover(page).getByText("People", { exact: true }).click();
    await popover(page).getByText("City", { exact: true }).hover();

    await expect(popover(page).getByText("City")).toBeVisible();
    await expect(popover(page).getByText("1,966 distinct values")).toBeVisible();
  });
});

test.describe("scenarios > filters > sql filters > multiple values", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  async function setFilterAndVerify(
    page: Page,
    { values, isQueryBuilder }: { values: string[]; isQueryBuilder?: boolean },
  ) {
    await filterWidget(page).click();
    await multiAutocompleteInput(popover(page)).pressSequentially(
      values.join(","),
    );
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    if (isQueryBuilder) {
      await page.getByTestId("run-button").first().click();
    }
    for (const value of values) {
      await expect(
        tableInteractive(page).getByText(value, { exact: true }).first(),
      ).toBeVisible();
    }
  }

  test("should allow multiple values for Text variables", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "SQL",
      native: {
        query: "SELECT * FROM products WHERE category IN ({{text}})",
        "template-tags": {
          text: {
            id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
            name: "text",
            "display-name": "Text",
            type: "text",
          },
        },
      },
      parameters: [
        {
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          type: "string/=",
          name: "Text",
          slug: "text",
          target: ["variable", ["template-tag", "text"]],
          isMultiSelect: true,
        },
      ],
      enable_embedding: true,
      embedding_params: {
        text: "enabled",
      },
    };

    // ad-hoc question
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "SELECT * FROM products WHERE category IN ({{text}})",
    );
    await rightSidebar(page).getByLabel("Multiple values").click();
    await setFilterAndVerify(page, {
      values: ["Gadget", "Widget"],
      isQueryBuilder: true,
    });

    // regular question
    const card = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);
    await setFilterAndVerify(page, {
      values: ["Gadget", "Widget"],
      isQueryBuilder: true,
    });

    // public question
    await visitPublicQuestion(page, mb, card.id);
    await setFilterAndVerify(page, {
      values: ["Gadget", "Widget"],
      isQueryBuilder: false,
    });

    // embedded question
    await visitEmbeddedPage(page, mb, {
      resource: { question: card.id },
      params: {},
    });
    await setFilterAndVerify(page, {
      values: ["Gadget", "Widget"],
      isQueryBuilder: false,
    });
  });

  test("should allow multiple values for Number variables", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      name: "SQL",
      native: {
        query: "SELECT ID FROM products WHERE ID IN ({{number}})",
        "template-tags": {
          number: {
            id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
            name: "number",
            "display-name": "Number",
            type: "number",
          },
        },
      },
      parameters: [
        {
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          type: "number/=",
          name: "Number",
          slug: "number",
          target: ["variable", ["template-tag", "number"]],
          isMultiSelect: true,
        },
      ],
      enable_embedding: true,
      embedding_params: {
        number: "enabled",
      },
    };

    // ad-hoc question
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "SELECT ID FROM products WHERE ID IN ({{number}})",
    );
    await openTypePickerFromDefaultFilterType(page);
    await popover(page).getByText("Number", { exact: true }).click();
    await rightSidebar(page).getByLabel("Multiple values").click();
    await setFilterAndVerify(page, {
      values: ["10", "20"],
      isQueryBuilder: true,
    });

    // regular question
    const card = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, card.id);
    await setFilterAndVerify(page, {
      values: ["10", "20"],
      isQueryBuilder: true,
    });

    // public question
    await visitPublicQuestion(page, mb, card.id);
    await setFilterAndVerify(page, {
      values: ["10", "20"],
      isQueryBuilder: false,
    });

    // embedded question
    await visitEmbeddedPage(page, mb, {
      resource: { question: card.id },
      params: {},
    });
    await setFilterAndVerify(page, {
      values: ["10", "20"],
      isQueryBuilder: false,
    });
  });
});
