/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/native/native.cy.spec.js.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9). Everything else the port needs is imported read-only
 * from existing shared modules.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";

export const MONGO_SKIP_REASON =
  "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)";

// === response waits (the spec's cy.intercept + cy.wait aliases) ===

/** POST /api/dataset — the spec's "@dataset" alias. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** POST /api/dataset/native — the spec's "@datasetNative" alias. */
export function waitForDatasetNative(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset/native",
  );
}

/** POST /api/card — the spec's "@card" alias. */
export function waitForCardPost(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

/** GET /api/card/:id — the spec's "@cardQuestion" alias. */
export function waitForCardGet(page: Page, id: number): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/card/${id}`,
  );
}

// === the spec's module-level helpers ===

/**
 * Port of the spec-local `runQuery()`:
 *
 *   cy.findByTestId("native-query-editor-container").within(() => {
 *     cy.button("Get Answer").click();
 *   });
 *   cy.wait("@dataset");
 *
 * Note this is NOT H.runNativeQuery — that one clicks the `play` icon and
 * additionally asserts the icon disappears. This clicks the labelled
 * "Get Answer" button and only waits for the dataset response.
 */
export async function runQuery(page: Page): Promise<Response> {
  const dataset = waitForDataset(page);
  await page
    .getByTestId("native-query-editor-container")
    .getByRole("button", { name: "Get Answer", exact: true })
    .click();
  return dataset;
}

/** Port of the spec-local `sidebarHeaderTitle()`. */
export function sidebarHeaderTitle(page: Page): Locator {
  return page.getByTestId("sidebar-header-title");
}

/** Port of the spec-local `dataReferenceSidebar()`. */
export function dataReferenceSidebar(page: Page): Locator {
  return page.getByTestId("sidebar-right");
}

// === CodeMirror text assertions ===

/**
 * The exact `textContent` of the editor, i.e. what chai-jquery's
 * `should("have.text", …)` compares against.
 *
 * Playwright's `toHaveText` NORMALIZES whitespace, which would collapse the
 * tab characters these tests exist to check ("\tSELECT" would read as
 * "SELECT"), so the comparison goes through `textContent()` in an
 * `expect.poll` instead. CodeMirror renders each line as its own div and
 * `textContent` concatenates them with no separator — identical to jQuery
 * `.text()`, which is what the Cypress assertions used.
 */
export async function expectEditorTextContent(
  editor: Locator,
  expected: string,
) {
  await expect.poll(() => editor.textContent()).toBe(expected);
}

/** Same, for a single `.cm-line`. */
export async function expectLineTextContent(line: Locator, expected: string) {
  await expect.poll(() => line.textContent()).toBe(expected);
}

/**
 * Port of H.NativeEditor.value(): join the editor's `.cm-line` text nodes
 * with newlines, skipping the placeholder line.
 */
export async function nativeEditorValue(page: Page): Promise<string> {
  return page
    .locator("[data-testid=native-query-editor] .cm-line")
    .evaluateAll((lines) =>
      lines
        .filter((line) => !line.querySelector(".cm-placeholder"))
        .map((line) => line.textContent ?? "")
        .join("\n"),
    );
}

/**
 * Port of `cy.viewport(w, h)` + the spec's `cy.wait(100)` "wait for UI to
 * re-render to avoid flakiness". The sleep is kept verbatim: it is guarding a
 * resize-observer-driven relayout with no DOM/network signal.
 */
export async function setViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(100);
}

/**
 * Press a key `times` times, paced.
 *
 * `keyboard.press(key, { delay })` is the keydown→keyup HOLD, not a gap
 * between presses (PORTING, corrected 2026-07-20), and an unpaced loop lets
 * CodeMirror coalesce selection updates. Cypress's `cy.realPress` was one
 * command each, so it always had queue latency between presses.
 */
export async function pressRepeatedly(page: Page, key: string, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
  }
}

/**
 * Port of `cy.type()` onto an input whose placeholder is its only handle.
 *
 * Native parameter widgets DROP their `placeholder` on focus (PORTING), so a
 * locator resolved from the placeholder stops matching the moment the click
 * lands. Resolve + click once, then type at `document.activeElement` — never
 * re-resolve. `cy.type()` also clicks its subject first and puts the caret at
 * the end of the existing value, which `End` reproduces.
 */
export async function clickAndType(locator: Locator, text: string) {
  await locator.click();
  const page = locator.page();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}
