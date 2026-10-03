/**
 * Helpers for the `add-initial-data` port
 * (e2e/test/scenarios/onboarding/add-initial-data.cy.spec.ts).
 *
 * New module per PORTING rule 9 (parallel agents never edit shared modules).
 * Everything here is a port of a spec-local helper from the Cypress original,
 * plus the two primitives that spec needed and no shared module provides: a
 * frame-scoped sidebar-section locator (for the full-app-embedding test) and a
 * synthetic HTML5 file drop (for `selectFile(..., { action: "drag-drop" })`).
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import { caseSensitiveSubstring } from "./text";
import { navigationSidebar } from "./ui";

/** The CSV payload every upload test in this spec uses. Upstream builds it
 * inline with `Cypress.Buffer.from("header1,header2\nvalue1,value2", "utf8")`
 * and names it `foo-bar.csv`; Metabase humanizes that to the model "Foo Bar". */
export const CSV_FILE = {
  name: "foo-bar.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("header1,header2\nvalue1,value2", "utf8"),
};

/** Port of the spec-local `addDataModal()`. */
export function addDataModal(scope: Page | FrameLocator): Locator {
  return scope.getByRole("dialog", { name: "Add data" });
}

/**
 * Port of the spec-local `getTab(tab)`.
 *
 * Upstream is `findAllByRole("tab").filter(':contains(<tab>)')` — jQuery
 * `:contains` is a CASE-SENSITIVE SUBSTRING match, so `hasText` (which is
 * case-INsensitive for strings) is ported through `caseSensitiveSubstring`.
 */
export function getTab(page: Page, tab: string): Locator {
  return addDataModal(page)
    .getByRole("tab")
    .filter({ hasText: caseSensitiveSubstring(tab) });
}

/** Port of the spec-local `openTab(tab)`. */
export async function openTab(page: Page, tab: string) {
  await getTab(page, tab).click();
}

/**
 * Port of the spec-local `openAddDataModalFromSidebar()`.
 *
 * `findByRole("section", …)` works in Cypress because testing-library will
 * match a literal `role="section"` attribute; Playwright's role engine will
 * not (see `ui.ts sidebarSection`, which this mirrors). The `should("be.visible")`
 * before the click is upstream's and is kept.
 */
export async function openAddDataModalFromSidebar(page: Page) {
  const button = sidebarSectionButton(page, "Data", "Add data");
  await expect(button).toBeVisible();
  await button.click();
}

/** `navigationSidebar().findByRole("section", { name }).findByLabelText(label)`.
 * `findByLabelText` is EXACT in testing-library, hence `{ exact: true }`. */
export function sidebarSectionButton(
  page: Page,
  section: string,
  label: string,
): Locator {
  return navigationSidebar(page)
    .locator(`[role="section"][aria-label="${section}"]`)
    .getByLabel(label, { exact: true });
}

/**
 * Frame-scoped twin of `ui.ts navigationSidebar` / `sidebarSection`, for the
 * full-app-embedding test: `visitFullAppEmbeddingUrl` returns a FrameLocator
 * and the shared helpers only accept a Page.
 */
export function frameNavigationSidebar(frame: FrameLocator): Locator {
  return frame.getByTestId("main-navbar-root");
}

export function frameSidebarSection(
  frame: FrameLocator,
  name: string,
): Locator {
  return frameNavigationSidebar(frame).locator(
    `[role="section"][aria-label="${name}"]`,
  );
}

/**
 * Port of `cy.findAllByRole("option").should("contain", text)`.
 *
 * 🔴 A bare `should("contain", x)` on a MULTI-element subject is chai-jquery's
 * ANY-OF case (`$el.is(":contains(x)")`), NOT a first-match check — porting it
 * as `.first()` would silently WEAKEN it, and as a concatenation would
 * STRENGTHEN it. So: "at least one option contains this text". Substring match
 * is case-sensitive, matching jQuery's `:contains`.
 */
export async function expectAnyContains(options: Locator, text: string) {
  await expect
    .poll(() => options.filter({ hasText: caseSensitiveSubstring(text) }).count())
    .toBeGreaterThan(0);
}

/** Port of `.and("not.contain", text)` on a multi-element subject: the
 * negation of the any-of above, i.e. NO element contains the text. */
export async function expectNoneContains(options: Locator, text: string) {
  await expect(
    options.filter({ hasText: caseSensitiveSubstring(text) }),
  ).toHaveCount(0);
}

/**
 * Port of `cy.location("pathname").should("eq", …)` / `cy.location("search")`.
 * `cy.location(...).should` RETRIES, so a one-shot `page.url()` read would be
 * stricter than upstream and catch transient states (PORTING: "Hash/URL
 * assertions that Cypress retried must be `expect.poll`").
 */
export async function expectPathname(page: Page, pathname: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

export async function expectSearch(page: Page, search: string) {
  await expect.poll(() => new URL(page.url()).search).toBe(search);
}

/**
 * Port of `cy.selectFile(payload, { action: "drag-drop" })` onto the
 * react-dropzone root.
 *
 * Cypress's drag-drop action dispatches a real `dragenter`/`dragover`/`drop`
 * sequence carrying a `DataTransfer` with the file; react-dropzone's
 * `getRootProps()` installs React handlers for exactly those. Playwright has no
 * built-in equivalent (`setInputFiles` targets the hidden `<input>` instead —
 * a DIFFERENT code path in this component, since `UploadInput` is a sibling of
 * the dropzone, not its child), so replay the sequence with one shared
 * DataTransfer inside a single `page.evaluate`.
 */
export async function dropFileOn(
  target: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await target.evaluate(
    (element, payload: { name: string; mimeType: string; base64: string }) => {
      const binary = atob(payload.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File([bytes], payload.name, { type: payload.mimeType }),
      );
      for (const type of ["dragenter", "dragover", "drop"]) {
        element.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
      }
    },
    {
      name: file.name,
      mimeType: file.mimeType,
      base64: file.buffer.toString("base64"),
    },
  );
}
