/**
 * Helpers for the data-studio snippets spec port
 * (e2e/test/scenarios/data-studio/snippets.cy.spec.ts).
 *
 * Ports of H.DataStudio.Snippets.* (e2e/support/helpers/e2e-data-studio-helpers.ts,
 * which builds its `editor` from codeMirrorHelpers("snippet-editor")) plus the
 * two API fixtures the spec uses that no support module exposes yet
 * (createSnippetFolder / updateSnippet).
 *
 * New module per PORTING rule 9 — imports read-only from the shared support
 * modules and does not edit them. The library-page / data-studio-chrome
 * locators are reused from support/data-studio-library.ts.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { findByDisplayValue } from "./filters-repros";
import { expect } from "./fixtures";

// === Snippet pages ==================================================

/** Port of H.DataStudio.Snippets.newPage(). */
export function newSnippetPage(page: Page): Locator {
  return page.getByTestId("new-snippet-page");
}

/** Port of H.DataStudio.Snippets.editPage(). */
export function editSnippetPage(page: Page): Locator {
  return page.getByTestId("edit-snippet-page");
}

/** Port of H.DataStudio.Snippets.archivedPage(). */
export function archivedSnippetsPage(page: Page): Locator {
  return page.getByTestId("archived-snippets-page");
}

/** Port of H.DataStudio.Snippets.visitSnippet(id). */
export async function visitSnippet(page: Page, snippetId: number) {
  await page.goto(`/data-studio/library/snippets/${snippetId}`);
}

/** The snippet header (`cy.findByTestId("snippet-header")`). */
export function snippetHeader(page: Page): Locator {
  return page.getByTestId("snippet-header");
}

// === Form controls ==================================================

/**
 * Port of H.DataStudio.Snippets.nameInput():
 * newSnippetPage().findByDisplayValue("New SQL snippet").
 *
 * The name field is an `EditableText`, i.e. a **textarea** — an input-only
 * display-value scan finds nothing (PORTING gotcha), so this goes through the
 * shared `findByDisplayValue`, which scans input/textarea/select.
 */
export function newSnippetNameInput(page: Page): Promise<Locator> {
  return findByDisplayValue(newSnippetPage(page), "New SQL snippet");
}

/**
 * The snippet name field addressed the way the spec's "editing" tests do:
 * `cy.findByPlaceholderText("Name")`. `PaneHeaderInput` defaults its
 * placeholder to "Name" and always renders a textarea (isMarkdown is false).
 */
export function snippetNameInput(page: Page): Locator {
  return page.getByPlaceholder("Name", { exact: true });
}

/**
 * Port of H.DataStudio.Snippets.descriptionInput():
 * cy.findByPlaceholderText("No description").
 *
 * NB this only exists while the description is empty or focused — the
 * description `EditableText` has `isMarkdown`, so a non-empty, unfocused value
 * renders as Markdown with no textarea at all.
 */
export function snippetDescriptionInput(page: Page): Locator {
  return page.getByPlaceholder("No description", { exact: true });
}

/** Port of H.DataStudio.Snippets.saveButton(). */
export function snippetSaveButton(page: Page): Locator {
  return page.getByRole("button", { name: "Save", exact: true });
}

/** Port of H.DataStudio.Snippets.cancelButton(). */
export function snippetCancelButton(page: Page): Locator {
  return page.getByRole("button", { name: "Cancel", exact: true });
}

// === The CodeMirror editor ==========================================
// Port of codeMirrorHelpers("snippet-editor", {}) — only the get/focus/type/
// value surface the spec uses.

/** Port of `editor.get()`: wait out the loading indicator, then the content. */
export function snippetEditor(page: Page): Locator {
  return page.locator("[data-testid=snippet-editor] .cm-content");
}

/**
 * Port of `editor.focus()`: click the RIGHT edge of the content (the Cypress
 * helper does `click("right", { force: true })` so the caret lands at the end),
 * then assert the editor actually took focus before any typing (PORTING
 * rule 5 — `page.keyboard.*` types at document.activeElement with no retry).
 * The trailing `End` mirrors the caret-at-end intent of the right-edge click.
 */
export async function focusSnippetEditor(page: Page) {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  const editor = snippetEditor(page);
  await expect(editor).toBeVisible();
  const box = await editor.boundingBox();
  if (box == null) {
    throw new Error("snippet editor has no bounding box");
  }
  await editor.click({
    position: { x: Math.max(box.width - 2, 0), y: box.height / 2 },
    force: true,
  });
  await expect(
    page.locator("[data-testid=snippet-editor] .cm-editor"),
  ).toHaveClass(/cm-focused/);
  await page.keyboard.press("End");
}

/** Port of `editor.type(text)` for plain text (no `{…}` escape sequences). */
export async function typeInSnippetEditor(
  page: Page,
  text: string,
  { focus = true }: { focus?: boolean } = {},
) {
  if (focus) {
    await focusSnippetEditor(page);
  }
  await page.keyboard.type(text, { delay: 10 });
}

/**
 * Port of `editor.value()`: join the `.cm-line` text nodes with newlines,
 * skipping the placeholder line.
 */
export async function snippetEditorValue(page: Page): Promise<string> {
  return snippetEditor(page).evaluate((content) =>
    Array.from(content.querySelectorAll(".cm-line"))
      .filter((line) => line.querySelector(".cm-placeholder") == null)
      .map((line) => line.textContent ?? "")
      .join("\n"),
  );
}

// === API fixtures ===================================================

/** Port of H.createSnippetFolder (api/createSnippetFolder.ts). */
export async function createSnippetFolder(
  api: MetabaseApi,
  {
    name,
    description = null,
    parent_id = null,
  }: { name: string; description?: string | null; parent_id?: number | null },
): Promise<{ id: number; name: string }> {
  const response = await api.post("/api/collection", {
    name,
    description,
    parent_id,
    namespace: "snippets",
  });
  return (await response.json()) as { id: number; name: string };
}

/** Port of H.updateSnippet (api/updateSnippet.ts). */
export async function updateSnippet(
  api: MetabaseApi,
  id: number,
  data: Record<string, unknown>,
) {
  return api.put(`/api/native-query-snippet/${id}`, data);
}

// === Response waits (PORTING rule 2) ================================

/** The `@createSnippet` alias: POST /api/native-query-snippet. */
export function waitForCreateSnippet(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/native-query-snippet",
  );
}

/** The `@updateSnippet` alias: PUT /api/native-query-snippet/*. */
export function waitForUpdateSnippet(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/native-query-snippet\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** The `@createCollection` alias: POST /api/collection. */
export function waitForCreateCollection(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/collection",
  );
}

/** The `@updateCollection` alias: PUT /api/collection/*. */
export function waitForUpdateCollection(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/collection\/[^/]+$/.test(new URL(response.url()).pathname),
  );
}

/**
 * Blur the focused `EditableText` textarea. Never `keyboard.press("Tab")` —
 * EditableText's root `onKeyDown` re-focuses on every non-Enter key, so Tab
 * bounces and the change is never committed (PORTING gotcha).
 */
export async function blurEditableText(page: Page) {
  await page.locator("textarea:focus").blur();
}
