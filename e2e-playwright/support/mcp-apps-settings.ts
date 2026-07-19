/**
 * Helpers for the admin MCP-apps settings spec
 * (e2e/test/scenarios/metabot/mcp-apps-settings.cy.spec.ts).
 *
 * Only the two non-trivial DOM interactions the spec needs live here; the
 * locators are simple enough to build inline in the spec.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Faithful port of the spec's `realHover` + `mouseenter` probe: move the REAL
 * pointer to the centre of `link` and report whether the link's own
 * `mouseenter` fired. If the parent Switch track covers the link the pointer
 * lands on the track and `mouseenter` never reaches the link.
 *
 * Uses `page.mouse.move` (not `link.hover()`) so there is no actionability /
 * pointer-interception guard — matching cypress-real-events' realHover, which
 * hovers the coordinate regardless of what sits on top.
 */
export async function pointerReachesLink(
  page: Page,
  link: Locator,
): Promise<boolean> {
  await link.scrollIntoViewIfNeeded();
  await link.evaluate((el) => {
    (el as HTMLElement & { __mouseEntered?: boolean }).__mouseEntered = false;
    el.addEventListener("mouseenter", () => {
      (el as HTMLElement & { __mouseEntered?: boolean }).__mouseEntered = true;
    });
  });
  const box = await link.boundingBox();
  if (!box) {
    throw new Error("Install-in-Cursor link has no bounding box");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return link.evaluate(
    (el) => (el as HTMLElement & { __mouseEntered?: boolean }).__mouseEntered === true,
  );
}

/**
 * Port of the spec's "click but preventDefault so the cursor:// deeplink is not
 * followed during the test". Attaches a one-off preventDefault handler, then
 * clicks the link.
 */
export async function clickLinkWithoutFollowing(link: Locator): Promise<void> {
  await link.evaluate((el) => {
    el.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
  });
  await link.click();
}
