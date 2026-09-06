/**
 * Helpers for the port of
 * `e2e/test/scenarios/admin/database-connection-strings.cy.spec.ts`.
 *
 * COLLISION CHECK (done before writing): `grep -rl "database-connection-strings"
 * tests/ support/` returns only *comments* in `tests/admin-databases.spec.ts`,
 * `tests/database-writable-connection.spec.ts` and `support/admin-databases.ts`
 * — all three are ports of DIFFERENT sources that named this file in their own
 * collision notes. No port of this spec existed. Module name is
 * `support/database-connection-strings.ts`, matching the source basename
 * exactly (no deviation).
 *
 * Everything reusable already lives in `support/admin-databases.ts` (button,
 * labeled, chooseDatabase, ResponseRecorder, waitForDbSync, pathnameIs, the QA
 * port constants) and is imported read-only by the spec. The only thing that
 * genuinely has no port yet is `cy.paste`.
 *
 * 🔴 CREDENTIALS: the upstream spec embeds passwords inside connection strings.
 * Nothing in this module logs, echoes or serialises a connection string.
 */
import type { Locator } from "@playwright/test";

/**
 * Port of `cy.paste(text)` (e2e/support/commands/ui/paste.ts).
 *
 * Upstream does NOT type: it calls the *native* `value` setter on
 * `HTMLInputElement.prototype` / `HTMLTextAreaElement.prototype` (bypassing
 * React's value tracker so React sees a real change), dispatches a bubbling
 * `change`, and then dispatches a synthetic `paste` ClipboardEvent for any
 * `onPaste` handlers. This is reproduced verbatim rather than being replaced
 * with `fill()` / `pressSequentially()`:
 *
 * - `fill()` would be a *behavioural* change — it fires `input`, not `change`,
 *   and it clears first, which upstream does not.
 * - `pressSequentially()` would fire the parse effect once per KEYSTROKE. The
 *   effect is what sets `lastParseStatusRef`, and the "events" describe asserts
 *   an exact event count, so keystroke-by-keystroke entry is not equivalent.
 *
 * The caret is left at the end of the value, which is where a real paste leaves
 * it and where `cy.type()` resumes from — the "failure events" test chains
 * `.paste(...).type(...)` and depends on the second string being APPENDED.
 */
export async function paste(locator: Locator, text: string) {
  await locator.evaluate((element, value) => {
    const nodeName = element.nodeName;
    const prototypes: Record<string, object> = {
      INPUT: window.HTMLInputElement.prototype,
      TEXTAREA: window.HTMLTextAreaElement.prototype,
    };
    const prototype = prototypes[nodeName];
    if (!prototype) {
      throw new Error(`Unsupported node type: ${nodeName}`);
    }

    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      "value",
    )?.set;
    nativeValueSetter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));

    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );

    // Leave the caret at the end, as a real paste (and cy.type's
    // "move to end of existing value" behaviour) does.
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    field.setSelectionRange?.(value.length, value.length);
  }, text);
}

/**
 * `cy.findByLabelText(x).type(text)` on a field that ALREADY has a value:
 * Cypress appends. `pressSequentially` types at the caret, which `paste()`
 * above leaves at the end, so this appends too.
 */
export async function typeAppending(locator: Locator, text: string) {
  await locator.focus();
  await locator.pressSequentially(text);
}
