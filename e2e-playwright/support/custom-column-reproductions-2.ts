/**
 * Helpers for custom-column-reproductions-2.spec.ts.
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). Everything the sibling ports already cover
 * (custom-column-3.ts, cc-typing-suggestion.ts, custom-column-reproductions-1.ts)
 * is imported read-only; only what none of them has lives here.
 */
import type { Locator, Page } from "@playwright/test";

import { customExpressionEditor } from "./custom-column";
import { typeInEditor } from "./custom-column-reproductions-1";
import { expect } from "./fixtures";

const EDITOR_TESTID = "custom-expression-query-editor";

/**
 * Port of Cypress's `.click(position, { force: true })`: a DISPATCH at the
 * resolved element, with no hit-testing at all. Playwright's
 * `click({ force: true })` is NOT this — it still moves the real mouse and
 * clicks whatever is topmost at those coordinates (PORTING).
 *
 * This matters throughout this spec because the expression editor's own
 * portalled overlays (the help-text popover `[data-testid=expression-helper]`,
 * the completions listbox, and the editor popover itself) sit ON TOP of the
 * element the test targets. Measured: five tests here timed out for 30s on
 * "…subtree intercepts pointer events" while the page was entirely correct.
 *
 * Coordinates mirror Cypress's rounding — `right` → `floor(right) - 1`,
 * centre → the floored midpoint — since CodeMirror places the caret from the
 * event's clientX/clientY.
 */
export async function dispatchClick(
  target: Locator,
  position: "center" | "right" = "center",
) {
  await target.evaluate((element, pos) => {
    const rect = element.getBoundingClientRect();
    const clientX =
      pos === "right"
        ? Math.floor(rect.right) - 1
        : Math.floor(rect.left + rect.width / 2);
    const clientY = Math.floor(rect.top + rect.height / 2);
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
    };
    const pointer = { ...base, pointerId: 1, isPrimary: true, pointerType: "mouse" };
    element.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
  }, position);
}

/**
 * Port of `H.CustomExpressionEditor.focus()`. The upstream is
 * `get().should("be.visible").click("right", { force: true })` — note the
 * `force`, which is there precisely because the editor's own popovers overlay
 * it. custom-column-3's `focusCustomExpressionEditor` uses a real click and so
 * cannot be used here (and is not ours to edit).
 *
 * The explicit `.focus()` backs up CodeMirror's own mousedown handler; `End`
 * then guarantees the caret is at the end of the line, which is what the
 * upstream's right-edge click achieves.
 */
export async function focusEditor(page: Page) {
  const content = customExpressionEditor(page);
  await expect(content).toBeVisible();
  await dispatchClick(content, "right");
  await content.evaluate((element) => (element as HTMLElement).focus());
  await expect(
    page.getByTestId(EDITOR_TESTID).locator(".cm-editor"),
  ).toHaveClass(/cm-focused/);
  await page.keyboard.press("End");
}

/** Port of `H.CustomExpressionEditor.clear()` on top of focusEditor. */
export async function clearEditor(page: Page) {
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
}

/**
 * `H.CustomExpressionEditor.type(text)` with the default `focus: true`, using
 * the force-focus above. The escape-sequence handling itself is reused from
 * custom-column-reproductions-1's typeInEditor.
 */
export async function typeExpression(page: Page, text: string) {
  await focusEditor(page);
  await typeInEditor(page, text, { focus: false });
}

/**
 * Port of `H.enterCustomColumnDetails` — same clear → type → blur → name
 * ordering as upstream, but routed through the force-focus above.
 */
export async function enterExpressionDetails(
  page: Page,
  {
    formula,
    name,
    blur = true,
  }: { formula: string; name?: string; blur?: boolean },
) {
  await clearEditor(page);
  await typeInEditor(page, formula, { focus: false });

  if (blur) {
    await blurEditor(page);
  }

  if (name) {
    const nameInput = page.getByTestId("expression-name");
    await nameInput.fill(name);
    await nameInput.blur();
  }
}

/**
 * Port of `H.CustomExpressionEditor.blur()`: the upstream clicks the
 * expression-editor widget's bottom-right corner (its footer, below the
 * contenteditable) with `force: true`, so again a dispatch rather than a real
 * click.
 */
export async function blurEditor(page: Page) {
  await page.getByTestId("expression-editor").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clientX = Math.floor(rect.right) - 1;
    const clientY = Math.floor(rect.bottom) - 1;
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
    };
    element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
  });
}

/**
 * Port of `H.CustomExpressionEditor.type(text, { allowFastSet: true })`
 * (e2e-codemirror-helpers.ts). The upstream escape hatch is:
 *
 *   helpers.focus();
 *   helpers.get().invoke("text", text);   // jQuery .text() → sets textContent
 *   helpers.type(" {backspace}");         // nudge CodeMirror's validator
 *
 * i.e. it blows away CodeMirror's rendered DOM and lets the editor's own
 * DOM observer re-read the document, then types a throwaway character so the
 * change handlers/validator actually run. Replayed verbatim, because the
 * formulas that use it contain characters `realType` can't send — and, more
 * importantly, because typing them for real would fire close-brackets and
 * autocomplete and produce a different document.
 */
export async function fastSetExpression(page: Page, text: string) {
  await focusEditor(page);
  await customExpressionEditor(page).evaluate((element, value) => {
    element.textContent = value;
  }, text);
  // The upstream's validator nudge. focus:true here matches the recursive
  // helpers.type(" {backspace}") call, which re-focuses by default.
  await typeExpression(page, " {backspace}");
}

/**
 * Port of `H.CustomExpressionEditor.completion(name).click()`.
 *
 * A completion row applies on **mousedown** (Listbox.tsx `handleMouseDown` →
 * `setSelectedCompletion` + CodeMirror `acceptCompletion`). Two measured facts
 * shape this helper:
 *
 * 1. A REAL click is required. A dispatched `mousedown` (either flavour —
 *    Playwright's `dispatchEvent` or a hand-built `MouseEvent`) reaches
 *    `document` — verified with a capture-phase counter, which incremented —
 *    yet React's `onMouseDown` never applies the completion: the document was
 *    unchanged at `"Coun"`, while a real click on the very same locator moments
 *    later produced `"CountIf(condition)"`. I could not explain this from the
 *    React portal-listener model and am recording it as measured-but-unexplained
 *    rather than inventing a mechanism. It is the reverse of the usual
 *    dispatch-beats-real-click rule, so it is worth knowing.
 * 2. The click must not land too soon after the list opens. Without a settle,
 *    the second click of issue 62987 left the document at `"CountIf(notEm)"`
 *    with no error — it silently applied nothing. Upstream has exactly this
 *    wait in `codeMirrorHelpers.selectCompletion` ("Avoid flakiness with
 *    CodeMirror not accepting the suggestion immediately", `cy.wait(300)`);
 *    the test under port relies on Cypress's per-command queue latency for it.
 *    Consistent with `@codemirror/autocomplete`'s `interactionDelay`, under
 *    which `acceptCompletion` declines outright — but that is inference, not
 *    something I measured.
 */
export async function clickCompletion(option: Locator) {
  await expect(option).toBeVisible();
  await option.page().waitForTimeout(300);
  await option.click();
}

/**
 * Port of `H.isScrollableHorizontally(element)`
 * (e2e-ui-elements-overflow-helpers.js) asserted `to.be.false`.
 *
 * Upstream reads `$el[0]` — the FIRST element of the subject — and the
 * assertion sits inside a `.should(cb)`, so it retries; hence expect.poll.
 */
export async function expectNotScrollableHorizontally(target: Locator) {
  await expect
    .poll(() =>
      target.first().evaluate((element) => {
        const { clientHeight, offsetHeight } = element as HTMLElement;
        const style = window.getComputedStyle(element);
        const borderTopWidth = parseInt(style.borderTopWidth, 10);
        const borderBottomWidth = parseInt(style.borderBottomWidth, 10);
        const borderWidth = borderTopWidth + borderBottomWidth;
        const horizontalScrollbarHeight =
          offsetHeight - clientHeight - borderWidth;
        return horizontalScrollbarHeight > 0;
      }),
    )
    .toBe(false);
}

/**
 * STRENGTHENING, stated explicitly (PORTING's hard rule).
 *
 * `expectNotScrollableHorizontally` above is the faithful port of upstream's
 * assertion — and that assertion is VACUOUS in this environment. Measured on
 * the jar, forcing the dropdown's direct child to `width: 2000px`:
 *
 *   scrollWidth 2000, clientWidth 1197  → genuinely overflowing
 *   offsetHeight 108, clientHeight 106, borders 2 → scrollbarHeight 0
 *
 * `H.isScrollableHorizontally` infers a scrollbar from the layout height it
 * reserves, but Chromium here uses OVERLAY scrollbars, which reserve none. So
 * the helper returns `false` for an element that is scrolling horizontally,
 * and issue 55984's two tests cannot fail. (Confirmed by mutation as well: a
 * short suggestion name in place of the 88-character one leaves the test
 * green.) Cypress has the same semantics, so this is vacuous upstream too —
 * not port drift.
 *
 * The intent is unambiguous ("the suggestion tooltip must not overflow
 * horizontally") and no security surface is involved, so the direct
 * measurement is added ALONGSIDE the verbatim port rather than replacing it.
 */
export async function expectNotOverflowingHorizontally(target: Locator) {
  await expect
    .poll(() =>
      target
        .first()
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(0);
}

/**
 * Cypress can only assert `cy.url()` after a same-tab navigation, so issue
 * 54638 rewrites the docs link's `target` to `_self` before clicking. Ported
 * as-is — but the destination is metabase.com, so the run would depend on the
 * public internet. Stub the docs origin with an empty 200 document: the URL
 * assertion (which is the whole subject) is unaffected, and the test stops
 * depending on a third party being up.
 */
export async function stubDocsOrigin(page: Page) {
  await page.route("https://www.metabase.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>docs stub</body></html>",
    }),
  );
}
