/**
 * Helpers for the gauge/funnel/treemap chart spec ports — `H` helpers not
 * yet in the shared modules:
 * - e2e-viz-settings-helpers.js (openVizTypeSidebar)
 * - e2e-ui-elements-helpers.js (getDraggableElements)
 * - e2e-ad-hoc-question-helpers.js (the native-autorun branch of
 *   visitQuestionAdhoc)
 *
 * Kept separate from the shared support/*.ts files because those are edited
 * by parallel porting agents; fold into charts.ts/ui.ts when consolidating.
 */
import type { Locator, Page } from "@playwright/test";

import { runNativeQuery } from "./models";
import { visitQuestionAdhoc } from "./permissions";

/** Port of H.openVizTypeSidebar. */
export async function openVizTypeSidebar(page: Page) {
  await page.getByTestId("viz-type-button").click();
}

/** Port of H.getDraggableElements: findAllByTestId(/draggable-item/). */
export function getDraggableElements(page: Page): Locator {
  return page.getByTestId(/draggable-item/);
}

/**
 * Native-autorun branch of H.visitQuestionAdhoc: ad-hoc native queries
 * don't run from the URL hash, so the Cypress helper clicks Run itself
 * (runNativeQuery({ wait: false })) and then waits for the dataset
 * response — runNativeQuery here does both.
 */
export async function visitNativeQuestionAdhoc(
  page: Page,
  question: Parameters<typeof visitQuestionAdhoc>[1],
) {
  await visitQuestionAdhoc(page, question, { autorun: false });
  await runNativeQuery(page);
}
