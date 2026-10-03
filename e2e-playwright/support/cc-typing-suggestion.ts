/**
 * Helpers for cc-typing-suggestion.spec.ts — the autocomplete / help-text
 * pieces of H.CustomExpressionEditor + H.enterCustomColumnDetails that the
 * shared modules don't yet cover.
 *
 * Lives in its own file so the shared support modules stay untouched. Reuses
 * the CodeMirror focus/clear/completions/value ports from custom-column-3.ts
 * and custom-column.ts read-only.
 *
 * The expression editor is CodeMirror: real keystrokes (page.keyboard IS CDP
 * input, the Playwright equivalent of the upstream cy.realType) drive it, and
 * focus is asserted before typing because page.keyboard types at
 * document.activeElement with no retry.
 */
import type { Locator, Page } from "@playwright/test";

import { customExpressionEditor } from "./custom-column";
import {
  clearCustomExpressionEditor,
  focusCustomExpressionEditor,
} from "./custom-column-3";
import { expect } from "./fixtures";

/**
 * Port of the spec-local addCustomColumn:
 * cy.findByTestId("action-buttons").findByText("Custom column").click().
 */
export async function addCustomColumn(page: Page) {
  await page
    .getByTestId("action-buttons")
    .getByText("Custom column", { exact: true })
    .click();
}

/**
 * Escape-aware CodeMirror type() — the pieces of H.CustomExpressionEditor.type
 * this spec exercises ({leftarrow}/{rightarrow}/{backspace}/{enter}/{tab} plus
 * literal text). focus:false skips the click+End so the current caret is kept
 * (upstream uses it when driving the editor mid-expression). Repeated key
 * presses are paced (~25ms) because page.keyboard has no per-command queue
 * latency and CodeMirror coalesces bursts.
 */
export async function typeExpression(
  page: Page,
  text: string,
  { focus = true, delay = 10 }: { focus?: boolean; delay?: number } = {},
) {
  if (focus) {
    await focusCustomExpressionEditor(page);
  }

  const parts = text.split(/(\{[^}]+\})/);
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    switch (part.toLowerCase()) {
      case "{leftarrow}":
        await page.keyboard.press("ArrowLeft", { delay: 25 });
        break;
      case "{rightarrow}":
        await page.keyboard.press("ArrowRight", { delay: 25 });
        break;
      case "{backspace}":
        await page.keyboard.press("Backspace", { delay: 25 });
        break;
      case "{enter}":
        await page.keyboard.press("Enter", { delay: 25 });
        break;
      case "{tab}":
        await page.keyboard.press("Tab", { delay: 25 });
        break;
      default:
        await page.keyboard.type(part, { delay });
    }
  }
}

/**
 * Port of H.enterCustomColumnDetails — but escape-aware (the shared notebook.ts
 * version types the formula literally, so it can't drive this spec's
 * `[Rating]{leftarrow}…{backspace}t` / `Count{enter}` formulas). clear() then
 * type(), with an optional blur that mirrors the upstream widget bottom-right
 * click.
 */
export async function enterCustomColumnDetails(
  page: Page,
  {
    formula,
    blur = true,
    delay = 10,
  }: { formula: string; blur?: boolean; delay?: number },
) {
  await clearCustomExpressionEditor(page);
  await typeExpression(page, formula, { focus: true, delay });
  if (blur) {
    await blurEditor(page);
  }
}

/**
 * Port of the CustomExpressionEditor.blur() from the codeMirror helper: click
 * the expression-editor widget's bottom-right (the footer, below the
 * contenteditable) so the .cm-content loses focus without closing the popover.
 */
export async function blurEditor(page: Page) {
  const widget = page.getByTestId("expression-editor");
  const box = await widget.boundingBox();
  if (!box) {
    throw new Error("expression-editor widget has no bounding box");
  }
  await widget.click({
    position: { x: box.width - 3, y: box.height - 3 },
    force: true,
  });
}

/** Port of H.CustomExpressionEditor.helpText() (testid "expression-helper"). */
export function helpText(page: Page): Locator {
  return page.getByTestId("expression-helper");
}

/**
 * Port of H.CustomExpressionEditor.helpTextHeader()
 * (testid "expression-helper-popover-structure").
 */
export function helpTextHeader(page: Page): Locator {
  return page.getByTestId("expression-helper-popover-structure");
}

/**
 * Port of H.CustomExpressionEditor.acceptCompletion(key): the completions popup
 * must be visible, then (after the upstream's 300ms anti-flake wait) press the
 * key to accept — without refocusing (focus:false upstream).
 */
export async function acceptCompletion(
  page: Page,
  key: "Enter" | "Tab" = "Enter",
) {
  await expect(
    page.getByTestId("custom-expression-editor-suggestions"),
  ).toBeVisible();
  // Mirror the upstream anti-flake wait for CodeMirror to register the popup.
  await page.waitForTimeout(300);
  await page.keyboard.press(key);
}

/**
 * The ul[role=listbox] inside the completions popover — the target of
 * `H.CustomExpressionEditor.completions().get("ul[role=listbox]")`.
 */
export function completionsListbox(page: Page): Locator {
  return page
    .getByTestId("custom-expression-editor-suggestions")
    .locator("ul[role=listbox]");
}

/**
 * Port of the spec-local verifyHelptextPosition: the help-text popover's left
 * edge tracks the given editor text's left edge (Chai closeTo, delta 5px).
 */
export async function verifyHelptextPosition(page: Page, text: string) {
  // Retried, unlike the upstream one-shot .then(): the help-text popover slides
  // to the new caret position, so an immediate read can catch it mid-transition.
  await expect
    .poll(async () => {
      const textBox = await customExpressionEditor(page)
        .getByText(text, { exact: true })
        .boundingBox();
      const helpBox = await helpText(page).boundingBox();
      if (!textBox || !helpBox) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(helpBox.x - textBox.x);
    })
    .toBeLessThanOrEqual(5);
}
