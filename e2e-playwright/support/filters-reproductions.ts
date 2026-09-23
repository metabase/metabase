/**
 * Per-spec helpers for tests/filters-reproductions.spec.ts (the port of
 * e2e/test/scenarios/filters-reproductions/filters-reproductions.cy.spec.js).
 *
 * Everything else this spec needs already exists in the shared support
 * modules (notebook / joins / filter / filters / filters-repros / ui /
 * ad-hoc-question / data-model / relative-datetime / native-editor …), so this
 * file only carries the two geometry ports that had no home.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { miniPicker } from "./notebook";

/**
 * Pick `table` from `database` in the notebook mini picker, tolerating the
 * SHARED writable QA container's schema debris (FINDINGS #85).
 *
 * Upstream clicks the database and then the table directly, which is correct
 * against a freshly-created `writable_db` (one `public` schema, so the picker
 * skips the schema level entirely). Our container is shared across five slots
 * and accumulates `Schema A`…`Schema Z` / `Domestic` / `Wild`, which makes the
 * picker render a schema level — and it is VIRTUALIZED, so `public` sorts past
 * the debris and is not in the DOM at all (measured: `getByText("public")`
 * resolves to 0 elements and `scrollIntoViewIfNeeded` times out).
 *
 * So: try the table first (the clean-container path, and what upstream does),
 * and only if it doesn't appear, wheel the virtual list until `public` renders
 * and drill through it. The schema is PINNED to `public` rather than left
 * unqualified, per the #85 rule — a same-named foreign table must not be able
 * to win the lookup.
 */
export async function pickMiniPickerTable(
  page: Page,
  database: string,
  table: string,
) {
  const picker = miniPicker(page);
  await picker.getByText(database, { exact: true }).click();

  const tableRow = picker.getByText(table, { exact: true });
  try {
    await expect(tableRow).toBeVisible({ timeout: 5_000 });
  } catch {
    const publicSchema = picker.getByText("public", { exact: true });
    await picker.hover();
    await expect(async () => {
      if ((await publicSchema.count()) === 0) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(120);
      }
      expect(await publicSchema.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });
    await publicSchema.click();
    await expect(tableRow).toBeVisible();
  }
  await tableRow.click();
}

/**
 * Port of H.assertDescendantNotOverflowsContainer
 * (e2e/support/helpers/e2e-ui-elements-overflow-helpers.js) applied to EVERY
 * descendant of `container`, which is what issue 50731 does inside its
 * `.and($element => …)` callback. Zero-size descendants are skipped, exactly
 * like upstream.
 */
export async function assertDescendantsNotOverflowContainer(
  container: Locator,
) {
  const overflows = await container.evaluate((element) => {
    const containerRect = element.getBoundingClientRect();
    const results: string[] = [];
    element.querySelectorAll("*").forEach((descendant, index) => {
      const rect = descendant.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) {
        return;
      }
      const label = `${descendant.tagName.toLowerCase()}[${index}]`;
      if (rect.bottom > containerRect.bottom) {
        results.push(`${label} bottom`);
      }
      if (rect.top < containerRect.top) {
        results.push(`${label} top`);
      }
      if (rect.left < containerRect.left) {
        results.push(`${label} left`);
      }
      if (rect.right > containerRect.right) {
        results.push(`${label} right`);
      }
    });
    return results;
  });
  expect(overflows, "descendants overflowing their container").toEqual([]);
}

/** `getBoundingClientRect()` read inside the page — `boundingBox()` is a second
 * round trip and returns null if the element re-rendered in between. */
export function rectOf(locator: Locator) {
  return locator.evaluate((element) => {
    const { top, bottom, left, right, width, height } =
      element.getBoundingClientRect();
    return { top, bottom, left, right, width, height };
  });
}
