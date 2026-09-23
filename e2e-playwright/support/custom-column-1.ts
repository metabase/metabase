/**
 * Helpers for custom-column-1.spec.ts — the few pieces of
 * H.CustomExpressionEditor / the notebook-clause UI that the shared modules
 * don't already cover. Lives in its own file so the shared support modules stay
 * untouched; every CodeMirror / notebook / factory helper it needs is imported
 * read-only from custom-column-3.ts, custom-column.ts, cc-typing-suggestion.ts,
 * notebook.ts, joins.ts and factories.ts.
 *
 * The expression editor is CodeMirror: real keystrokes drive it, and the
 * shortcut / format button are exercised through the imported ports.
 */
import type { Locator, Page } from "@playwright/test";

import {
  customExpressionCompletions,
  focusCustomExpressionEditor,
} from "./custom-column-3";
import { expect } from "./fixtures";

/**
 * Port of `H.CustomExpressionEditor.type("fn{tab}[Arg]{tab}[Arg2]", { delay })`
 * for the suggestion-snippet tests. Accepting a function completion inserts a
 * CodeMirror snippet (`coalesce(value1, value2)`) whose fields are advanced with
 * Tab; `[…]` column args are filled between the Tabs.
 *
 * The subtlety this bridges: driving the arg text with `page.keyboard.type`
 * types the `[`, which fires CodeMirror's close-brackets + column autocomplete —
 * and that transaction kills the active snippet, so the next Tab indents instead
 * of advancing (verified: it drops the `+`, leaving "coalesce([Tax][User ID],
 * value2)"). `page.keyboard.insertText` inserts the literal text with NO key
 * events, so neither extension fires and the snippet survives — Tab then advances
 * the field cleanly. cypress-real-events' realType drives the same feature
 * without the clash; the original Cypress spec passes these two tests on the same
 * jar under `--browser chrome`, so this is an input-method port, not a behaviour
 * change. Function-name segments are real-typed (they must trigger the completion
 * the following Tab accepts); `[…]` segments are inserted.
 */
export async function typeSnippet(
  page: Page,
  text: string,
  { focus = true, delay = 50 }: { focus?: boolean; delay?: number } = {},
) {
  if (focus) {
    await focusCustomExpressionEditor(page);
  }

  const segments = text.split("{tab}");
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment !== "") {
      if (segment.startsWith("[")) {
        await page.keyboard.insertText(segment);
      } else {
        await page.keyboard.type(segment, { delay });
        // The real-typed function name must show the completion the next Tab
        // accepts.
        await expect(customExpressionCompletions(page)).toBeVisible();
      }
    }
    // A Tab between each segment: after the function name it accepts the
    // completion (starting the snippet); after an arg it advances the field.
    if (index < segments.length - 1) {
      await page.keyboard.press("Tab");
    }
  }
}

/**
 * Port of the repeated `cy.findByLabelText("Custom column").click()` (the
 * notebook action button carries that aria-label). Distinct from the
 * action-buttons `getByText` and the `.Icon-add_data` forms other tests use.
 */
export async function addCustomColumnByLabel(page: Page) {
  await page.getByLabel("Custom column", { exact: true }).click();
}

/**
 * Port of H.CustomExpressionEditor.formatButton(): cy.findByLabelText(
 * "Auto-format"). Returned as a locator so callers can assert visible /
 * not-exist as the upstream `.should("be.visible")` / `.should("not.exist")` do.
 */
export function formatButton(page: Page): Locator {
  return page.getByLabel("Auto-format", { exact: true });
}

/**
 * Port of the format keyboard shortcut (Shift + $mod + f) upstream fires with
 * `cy.realPress(["Shift", H.metaKey, "f"])`. ControlOrMeta picks the right
 * modifier per platform. The editor must already be focused.
 */
export async function pressFormatShortcut(page: Page) {
  await page.keyboard.press("Shift+ControlOrMeta+f");
}

/**
 * Port of `H.getNotebookStep(step).findByText(name).icon("close").click()`:
 * remove a notebook clause pill (a filter or expression). The pill is a button
 * whose accessible name is `<name> close icon`; clicking the button body
 * re-opens the editor, so click the inner close img (the same inner-img pattern
 * cc-literals.ts uses for filter-pill removal).
 */
export async function removeNotebookClauseByText(step: Locator, name: string) {
  await step
    .getByRole("button", { name: `${name} close icon`, exact: true })
    .getByRole("img", { name: "close icon", exact: true })
    .click();
}
