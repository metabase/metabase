/**
 * Helpers for the column-compare spec (port of the spec-local helpers in
 * e2e/test/scenarios/question/column-compare.cy.spec.ts). Lives in its own file
 * so the shared support modules stay untouched.
 *
 * NOTE: the upstream spec is tagged `@skip` (the "Compare to the past"
 * components are disabled in the product), so none of these helpers are
 * exercised at runtime in the current port — see the spec header.
 */
import { Locator, Page, expect } from "@playwright/test";

import { customExpressionEditor } from "./custom-column";
import {
  getNotebookStep,
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
  visualize,
} from "./notebook";
import { rightSidebar } from "./question-saved";
import { caseSensitiveSubstring } from "./text";
import { popover } from "./ui";

export type CheckTextOpts = {
  itemName: string;
  type?: "moving-average" | "offset";
  step1Title?: string;
  step2Title: string;
  offsetHelp: string;
  presets?: string[];
  includePeriodText?: string;
};

export async function toggleColumnPickerItems(page: Page, names: string[]) {
  // cy.findByTestId("column-picker").parent().click()
  await page.getByTestId("column-picker").locator("..").click();

  for (const name of names) {
    // cy.findAllByTestId("column-picker-item").contains(name).click() —
    // case-sensitive substring, first match.
    await page
      .getByTestId("column-picker-item")
      .filter({ hasText: caseSensitiveSubstring(name) })
      .first()
      .click();
  }

  await page.getByTestId("column-picker").locator("..").click();
}

export async function verifyNoColumnCompareShortcut(page: Page) {
  // H.popover().findByText(/compare/).should("not.exist")
  await expect(popover(page).getByText(/compare/)).toHaveCount(0);
}

async function verifyPresets(scope: Locator, presets: string[] = []) {
  for (const preset of presets) {
    await expect(scope.getByText(preset, { exact: true })).toBeVisible();
  }
}

async function selectCustomOffset(scope: Locator) {
  // Broken up like the upstream helper: the sidebar sometimes rerenders while
  // clicking, so assert visibility first, then click.
  const btn = scope.getByText("Custom...", { exact: true });
  await expect(btn).toBeVisible();
  await btn.click();
}

async function verifyOffsetOrMovingAverage(scope: Locator, options: CheckTextOpts) {
  if (options.type === "moving-average") {
    await scope.getByText("Moving average", { exact: true }).click();
    if (options.includePeriodText) {
      await expect(
        scope.getByText(options.includePeriodText, { exact: true }),
      ).toBeVisible();
    }
  } else {
    await verifyPresets(scope, options.presets);
    await selectCustomOffset(scope);
  }
}

async function verifyStep1(scope: Locator, options: CheckTextOpts) {
  if (options.step1Title) {
    await expect(scope.getByText(options.step1Title, { exact: true })).toBeVisible();
    await expect(scope.getByText("Sum of Price", { exact: true })).toBeVisible();
    await scope.getByText("Count", { exact: true }).click();
  }
}

export async function verifySummarizeText(page: Page, options: CheckTextOpts) {
  await page.getByRole("button", { name: /Summarize/ }).click();
  await rightSidebar(page)
    .getByRole("button", { name: "Add aggregation", exact: true })
    .click();

  const pop = popover(page);
  const item = pop.getByText(options.itemName, { exact: true });
  await expect(item).toBeVisible();
  await item.click();

  await verifyStep1(pop, options);
  await verifyOffsetOrMovingAverage(pop, options);

  await expect(pop.getByText(options.step2Title, { exact: true })).toBeVisible();
  await expect(pop.getByText(options.offsetHelp, { exact: true })).toBeVisible();
}

export async function verifyColumnDrillText(
  page: Page,
  options: Omit<CheckTextOpts, "step1Title">,
) {
  await tableHeaderClick(page, "Count");

  const pop = popover(page);
  const item = pop.getByText(options.itemName, { exact: true });
  await expect(item).toBeVisible();
  await item.click();
  await expect(pop.getByText(options.step2Title, { exact: true })).toBeVisible();

  // Upstream never sets step1Title on this call site (type is Omit<...>), so
  // this reuses the shared branch with step1Title always absent.
  await verifyOffsetOrMovingAverage(pop, options as CheckTextOpts);

  await expect(pop.getByText(options.offsetHelp, { exact: true })).toBeVisible();
}

export async function verifyPlusButtonText(page: Page, options: CheckTextOpts) {
  await page.getByRole("button", { name: "Add column", exact: true }).click();

  const pop = popover(page);
  const item = pop.getByText(options.itemName, { exact: true });
  await expect(item).toBeVisible();
  await item.click();

  await verifyStep1(pop, options);
  await verifyOffsetOrMovingAverage(pop, options);

  await expect(pop.getByText(options.step2Title, { exact: true })).toBeVisible();
  await expect(pop.getByText(options.offsetHelp, { exact: true })).toBeVisible();
}

export async function verifyNotebookText(page: Page, options: CheckTextOpts) {
  await openNotebook(page);
  await getNotebookStep(page, "summarize")
    .getByTestId("aggregate-step")
    .last()
    .locator(".Icon-add")
    .click();

  const pop = popover(page);
  await pop.getByText("Basic functions", { exact: true }).click();

  const item = pop.getByText(options.itemName, { exact: true });
  await expect(item).toBeVisible();
  await item.click();

  if (options.step1Title) {
    await expect(pop.getByText(options.step1Title, { exact: true })).toBeVisible();
    await expect(pop.getByText("Sum of Price", { exact: true })).toBeVisible();
    const count = pop.getByText("Count", { exact: true });
    await expect(count).toBeVisible();
    await count.click();
  }

  await verifyOffsetOrMovingAverage(pop, options);

  // Upstream asserts "exist" (not "be.visible") for these two.
  await expect(pop.getByText(options.step2Title, { exact: true })).toBeAttached();
  await expect(pop.getByText(options.offsetHelp, { exact: true })).toBeAttached();
}

type AggregationResult = {
  name: string;
  expression: string;
};

export async function verifyAggregations(
  page: Page,
  results: AggregationResult[],
) {
  for (const result of results) {
    const pill = page
      .getByTestId("aggregate-step")
      .getByText(result.name, { exact: true });
    await expect(pill).toBeVisible();
    await pill.click();

    // Upstream reads `.ace_content`; the aggregation expression editor is now
    // CodeMirror, so read its content node (customExpressionEditor). Unverified
    // at runtime — the feature is disabled and the spec is @skip.
    await expect(customExpressionEditor(page)).toHaveText(result.expression);

    await page.keyboard.press("Escape");
  }
}

export async function verifyColumns(page: Page, names: string[]) {
  await visualize(page);

  for (const name of names) {
    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: caseSensitiveSubstring(name) })
        .first(),
    ).toBeVisible();
  }
}

export function breakout(
  page: Page,
  { column, bucket }: { column: string; bucket?: string },
): Locator {
  const name = bucket ? `${column}: ${bucket}` : column;
  return page.getByTestId("breakout-step").getByText(name, { exact: true });
}

export async function verifyBreakoutExistsAndIsFirst(
  page: Page,
  options: { column: string; bucket?: string },
) {
  const el = breakout(page, options);
  await expect(el).toBeAttached();
  // .parent().parent().should("match", ":first-child")
  const isFirst = await el
    .locator("..")
    .locator("..")
    .evaluate((node) => node.matches(":first-child"));
  expect(isFirst).toBe(true);
}
