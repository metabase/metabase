/**
 * Spec-local helpers for the binning-reproductions port
 * (e2e/test/scenarios/binning/binning-reproductions.cy.spec.js).
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). All the heavy lifting (openTable,
 * changeBinningForDimension, getBinningButtonForDimension) is imported
 * read-only from support/binning.ts.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createNativeQuestion, type Card } from "./factories";
import type { NativeQuestionDetails } from "./factories";
import { miniPicker } from "./notebook";
import { popover, visitQuestion } from "./ui";

/**
 * Port of `H.createNativeQuestion(details, { loadMetadata: true })`: the
 * Cypress option visits the freshly-created card and waits for its query so
 * `result_metadata` is populated before the card is used as a notebook/join
 * source. Here we create through the factory, then reuse the shared
 * visitQuestion port (which waits query_metadata + query).
 */
export async function createNativeQuestionWithMetadata(
  page: Page,
  api: MetabaseApi,
  details: NativeQuestionDetails,
): Promise<Card> {
  const card = await createNativeQuestion(api, details);
  await visitQuestion(page, card.id);
  return card;
}

/**
 * The exact "New question" flow these repros depend on: open the mini picker,
 * drill into "Our analytics", pick the saved question by name. The comment in
 * the 10441/11439 test stresses that visiting /collection/root instead would
 * change the outcome — so this stays a mini-picker drill, not an API visit.
 */
export async function pickSavedQuestion(page: Page, name: string) {
  await miniPicker(page).getByText("Our analytics", { exact: true }).click();
  await miniPicker(page).getByText(name, { exact: true }).click();
}

/**
 * Port of `H.popover().findByRole("option", { name }).click({ position: "left" })`:
 * click the left-center of a breakout column option so the column is picked
 * (default bucket) rather than opening its temporal-bucket sub-popover, whose
 * button sits on the right of the row.
 */
export async function clickBreakoutOptionLeft(option: Locator) {
  const box = await option.boundingBox();
  if (!box) {
    throw new Error("clickBreakoutOptionLeft: option has no bounding box");
  }
  await option.click({ position: { x: 6, y: box.height / 2 } });
}

/**
 * The temporal-bucket button revealed on hover inside the notebook group-by
 * popover (the `by month` button on the CREATED_AT row). Hover the row's text
 * first, like the Cypress `realHover()`.
 */
export async function openTemporalBucketFromGroupBy(page: Page, column: RegExp) {
  const row = popover(page).getByText(column).first();
  await row.hover();
  await popover(page).getByText("by month", { exact: true }).click({
    force: true,
  });
}
