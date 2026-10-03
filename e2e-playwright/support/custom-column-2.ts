/**
 * Helpers for custom-column-2.spec.ts — the pieces of
 * H.CustomExpressionEditor (e2e/support/helpers/e2e-custom-column-helpers.ts +
 * e2e-codemirror-helpers.ts) that the shared modules don't already cover.
 *
 * Lives in its own file so the shared support modules stay untouched; the
 * CodeMirror focus/clear/completion ports are imported read-only from
 * custom-column-3.ts and custom-column.ts.
 *
 * The expression editor is CodeMirror, so real keystrokes drive it
 * (page.keyboard IS CDP input — the equivalent of the realType/realPress the
 * upstream helper uses), and focus is asserted before typing.
 */
import type { Locator, Page } from "@playwright/test";

import {
  clearCustomExpressionEditor,
  customExpressionName,
  focusCustomExpressionEditor,
} from "./custom-column-3";
import { customExpressionEditor } from "./custom-column";
import { expect } from "./fixtures";

/** Port of H.CustomExpressionEditor.helpTextHeader(). */
export function helpTextHeader(page: Page): Locator {
  return page.getByTestId("expression-helper-popover-structure");
}

/** Port of H.CustomExpressionEditor.helpText(). */
export function helpText(page: Page): Locator {
  return page.getByTestId("expression-helper");
}

/** Port of H.CustomExpressionEditor.completions(): the suggestion dropdown. */
export function completions(page: Page): Locator {
  return page.getByTestId("custom-expression-editor-suggestions");
}

/**
 * The `role="option"` rows inside the suggestion dropdown.
 *
 * Upstream writes `completions().findByRole("option").should("not.exist")` /
 * `.findAllByRole("option").should("be.visible")`. In Cypress 12+ the whole
 * query chain is retried together, so a *missing* dropdown container also
 * satisfies `not.exist` — hence `toHaveCount(0)` on the descendant locator is
 * the exact equivalent (it does not require the container to exist either).
 */
export function completionOptions(page: Page): Locator {
  return completions(page).getByRole("option");
}

/**
 * `@codemirror/autocomplete`'s `interactionDelay` facet (default **75ms**,
 * unchanged by Metabase's `autocompletion({...})` config in
 * `querying/expressions/suggestions/suggest.ts`).
 *
 * Both `acceptCompletion` and `moveCompletionSelection` bail out with
 *
 *   Date.now() - cState.open.timestamp < interactionDelay  →  return false
 *
 * (node_modules/@codemirror/autocomplete/dist/index.js:1044,1066). So for 75ms
 * after the suggestion tooltip OPENS, Enter / Mod-j / an option click are all
 * silently refused — and a refused Enter falls through to insertNewline, which
 * corrupts the document rather than failing loudly. **Measured on this box:**
 * three back-to-back Enters after the tooltip became visible produced
 * `["rou", "", "", ""]` (three newlines, no acceptance); the same sequence with
 * a 300ms pause produced `round(column)`.
 *
 * The tooltip's own DOM is NOT a valid gate: the option renders with
 * `aria-selected="true"` immediately, i.e. before the delay has elapsed
 * (measured). Cypress never hits this because every `cy.realPress` /
 * `cy.realType` is a separate command with queue overhead — and where it does,
 * the upstream helper works around it with an explicit `cy.wait(300)`
 * ("Avoid flakiness with CodeMirror not accepting the suggestion immediately"
 * in `acceptCompletion` / `selectCompletion` / `{nextcompletion}`).
 *
 * This is the same root cause as the known "first Mod-j after a completion
 * tooltip is silently refused" gotcha — `moveCompletionSelection` carries the
 * identical guard.
 */
const COMPLETION_INTERACTION_DELAY_MS = 300;

/**
 * Port of H.CustomExpressionEditor.selectCompletion(name):
 *   completions().should("be.visible"); cy.wait(300);
 *   completions().findAllByRole("option").contains(name).first().click()
 *
 * `cy.contains` is a case-sensitive substring that yields the DEEPEST matching
 * node (often a child span of the option), so the click can land on a child —
 * clicking the option row itself is equivalent for this widget. Upstream's
 * explicit 300ms wait is ported verbatim: the Listbox's click handler calls
 * `acceptCompletion(view)`, which is subject to the same interactionDelay
 * guard, so this is the app's timing contract rather than a flake sleep.
 */
export async function selectCompletion(page: Page, name: string) {
  await expect(completions(page)).toBeVisible();
  await page.waitForTimeout(COMPLETION_INTERACTION_DELAY_MS);
  const option = completionOptions(page)
    .filter({ hasText: new RegExp(escapeRegExp(name)) })
    .first();
  await expect(option).toBeVisible();
  await option.click();
}

/**
 * Port of H.CustomExpressionEditor.type()'s escape-sequence handling for the
 * sequences this spec uses. Upstream splits on /(\{[^}]+\})/ and maps each
 * token to a cy.realPress; everything else is realType'd.
 *
 * NOTE on `{enter}`: upstream is literally `cy.realPress(["Enter"])`. When the
 * completion tooltip is open CodeMirror binds Enter to acceptCompletion, so the
 * keypress ACCEPTS the highlighted suggestion rather than inserting a newline.
 * Cypress's command queue supplies the settle time for the async completion
 * list; Playwright fires back to back, so `{enter}` waits for the dropdown to
 * be visible first when one is pending (`awaitCompletionsBeforeEnter`).
 */
export async function typeInExpressionEditor(
  page: Page,
  text: string,
  {
    focus = true,
    awaitCompletionsBeforeEnter = false,
  }: { focus?: boolean; awaitCompletionsBeforeEnter?: boolean } = {},
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
        await page.keyboard.press("ArrowLeft");
        break;
      case "{rightarrow}":
        await page.keyboard.press("ArrowRight");
        break;
      case "{downarrow}":
        await page.keyboard.press("ArrowDown");
        break;
      case "{uparrow}":
        await page.keyboard.press("ArrowUp");
        break;
      case "{home}":
      case "{movetostart}":
        await page.keyboard.press("Home");
        break;
      case "{end}":
      case "{movetoend}":
        await page.keyboard.press("End");
        break;
      case "{backspace}":
        await page.keyboard.press("Backspace");
        break;
      case "{tab}":
        await page.keyboard.press("Tab");
        break;
      case "{enter}": {
        if (!awaitCompletionsBeforeEnter) {
          await page.keyboard.press("Enter");
          break;
        }
        await expect(completions(page)).toBeVisible();
        await expect(completionOptions(page).first()).toBeVisible();
        await page.waitForTimeout(COMPLETION_INTERACTION_DELAY_MS);
        const linesBefore = await customExpressionEditor(page)
          .locator(".cm-line")
          .count();
        await page.keyboard.press("Enter");
        // Input-method fidelity check (not a product assertion): if the accept
        // was refused the keypress inserted a newline instead, which would
        // corrupt the formula and surface as an unrelated failure later.
        await expect(customExpressionEditor(page).locator(".cm-line")).toHaveCount(
          linesBefore,
        );
        break;
      }
      default:
        await page.keyboard.type(part, { delay: 10 });
    }
  }
}

/**
 * Port of H.CustomExpressionEditor.blur().
 *
 * Upstream's override clicks the expression-editor widget's bottom-right
 * corner with `{ force: true }`; the ported form calls DOM blur() on the
 * CodeMirror content node instead — same effect on the editor's blur handler
 * (which is what the validation message under test keys off), without a real
 * mouse click that would park the cursor over the widget footer. This mirrors
 * the already-landed shared `enterCustomColumnDetails` in support/notebook.ts.
 */
export async function blurExpressionEditor(page: Page) {
  await customExpressionEditor(page).blur();
}

/**
 * Port of H.enterCustomColumnDetails, with the escape-sequence-aware type()
 * (the shared support/notebook.ts version raw-types the formula, which would
 * emit a literal "{enter}").
 */
export async function enterCustomColumnDetails(
  page: Page,
  {
    formula,
    name,
    blur = true,
    awaitCompletionsBeforeEnter = false,
  }: {
    formula: string;
    name?: string;
    blur?: boolean;
    awaitCompletionsBeforeEnter?: boolean;
  },
) {
  await clearCustomExpressionEditor(page);
  await typeInExpressionEditor(page, formula, {
    focus: false,
    awaitCompletionsBeforeEnter,
  });

  if (blur) {
    await blurExpressionEditor(page);
  }

  if (name) {
    const nameInput = customExpressionName(page);
    await nameInput.fill(name);
    await nameInput.blur();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
