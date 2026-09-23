import type { FrameLocator, Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { getEmbedSidebar } from "./sdk-embed-setup";
import {
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "./sdk-iframe";

/**
 * Spec-local helpers for
 * tests/sdk-embed-setup-select-embed-options.spec.ts.
 *
 * Everything reusable across the `sdk-iframe-embedding-setup/` tier already
 * lives in `support/sdk-embed-setup.ts` (consumed read-only). This module holds
 * only the three shapes that spec repeats and that no other ported spec needs
 * yet.
 */

/**
 * Port of `H.getSimpleEmbedIframeContent()`.
 *
 * IMPORTANT — the Cypress helper is not just an accessor: before scoping into
 * the frame it asserts (retrying) that `iframe[data-metabase-embed]` AND
 * `iframe[data-iframe-loaded]` exist. Every `H.getSimpleEmbedIframeContent()
 * .findByX(...).should("not.exist")` in the original therefore asserts TWO
 * things — "the preview finished loading" and "X is absent". Porting it as a
 * bare `getSimpleEmbedIframe(page)` would keep only the second half, and that
 * half passes trivially while the preview is still blank. So this is an
 * `async` gate that awaits the load first, exactly like upstream.
 *
 * The wizard re-mounts the preview iframe whenever an embed option changes, so
 * the gate has to be re-run at every use site rather than hoisted per test.
 */
export async function embedPreview(page: Page): Promise<FrameLocator> {
  await waitForSimpleEmbedIframesToLoad(page);
  return getSimpleEmbedIframe(page);
}

/**
 * Port of
 *   `getEmbedSidebar().findByLabelText(label).closest("[data-testid=tooltip-warning]").icon("info")`.
 *
 * `TooltipWarning` (components/Common/TooltipWarning.tsx) renders a
 * `<Flex data-testid="tooltip-warning">` wrapping BOTH the labelled control and
 * the info icon that carries the Tooltip/HoverCard, so `closest()` from the
 * input lands on that Flex. Playwright has no `closest()`; the equivalent
 * narrowing is "the tooltip-warning that contains this control".
 *
 * The `has:` sub-locator is deliberately built from `page`, not from the
 * sidebar Locator — a `has` built from a Locator scope gets re-anchored to that
 * scope instead of being matched inside each candidate (PORTING.md, wave 11).
 */
export function tooltipWarningInfoIcon(page: Page, label: string): Locator {
  return getEmbedSidebar(page)
    .getByTestId("tooltip-warning")
    .filter({ has: page.getByLabel(label, { exact: true }) })
    .locator(".Icon-info");
}

/**
 * Port of `getEmbedSidebar().findByLabelText(label)` for the wizard's Mantine
 * `Switch`es. The real `<input role="switch">` is visually hidden behind the
 * track, so it needs `{ force: true }` (PORTING.md rule 4); Cypress's synthetic
 * click never had to care.
 */
export function optionSwitch(page: Page, label: string): Locator {
  return getEmbedSidebar(page).getByLabel(label, { exact: true });
}

/** Click a Mantine switch and assert its resulting state, mirroring upstream's
 * `.click().should("be.checked" | "not.be.checked")` chain. */
export async function toggleOptionSwitch(
  page: Page,
  label: string,
  expectedAfter: boolean,
) {
  await optionSwitch(page, label).click({ force: true });

  if (expectedAfter) {
    await expect(optionSwitch(page, label)).toBeChecked();
  } else {
    await expect(optionSwitch(page, label)).not.toBeChecked();
  }
}
