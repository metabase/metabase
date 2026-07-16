/**
 * Helpers for dashboard-card specs (ports from e2e-dashboard-helpers.ts and
 * the dnd-kit movers in e2e-ui-elements-helpers.js).
 */
import { Locator, Page, expect } from "@playwright/test";

import { getDashboardCard } from "./dashboard";

/** Port of the cy.icon command: `.Icon-<name>` selector. */
export function icon(scope: Page | Locator, name: string): Locator {
  return scope.locator(`.Icon-${name}`);
}

/** Port of H.showDashboardCardActions (realHover → native hover). */
export async function showDashboardCardActions(page: Page, index = 0) {
  await getDashboardCard(page, index).hover();
}

/** Port of H.getDashboardCardMenu — waits for the card to finish loading. */
export async function getDashboardCardMenu(
  page: Page,
  index = 0,
): Promise<Locator> {
  const card = getDashboardCard(page, index);
  await expect(card.getByTestId("loading-indicator")).toHaveCount(0);
  return card.getByTestId("dashcard-menu");
}

/**
 * Port of cy.findByDisplayValue: find the input in `scope` whose current
 * value equals `value`. Resolves once — call with the container stable.
 */
export async function inputWithValue(
  scope: Locator,
  value: string,
): Promise<Locator> {
  const inputs = scope.locator("input");
  await expect(inputs.first()).toBeVisible();
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    if ((await inputs.nth(i).inputValue()) === value) {
      return inputs.nth(i);
    }
  }
  throw new Error(`No input with value "${value}" found`);
}

/**
 * Port of H.moveDnDKitElementByAlias — but with real mouse input instead of
 * synthetic events, which dnd-kit's sensors accept natively: press, exceed
 * the activation threshold, glide to the target, release.
 */
export async function moveDnDKitElement(
  element: Locator,
  { horizontal = 0, vertical = 0 }: { horizontal?: number; vertical?: number },
) {
  const page = element.page();
  const box = await element.boundingBox();
  if (!box) {
    throw new Error("Cannot drag an element without a bounding box");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed the sensor's activation constraint first.
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });
  await page.mouse.move(startX + horizontal, startY + vertical, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/**
 * Deterministic dnd-kit sortable move: drag `element` so its center lands
 * just past `target`'s center (below when moving down, above when moving
 * up), regardless of row heights.
 */
export async function moveDnDKitElementOnto(element: Locator, target: Locator) {
  const page = element.page();
  const [box, targetBox] = [
    await element.boundingBox(),
    await target.boundingBox(),
  ];
  if (!box || !targetBox) {
    throw new Error("Cannot drag without bounding boxes");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const targetY = targetBox.y + targetBox.height / 2;
  const overshoot = targetY > startY ? 4 : -4;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });
  await page.mouse.move(startX, targetY + overshoot, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}
