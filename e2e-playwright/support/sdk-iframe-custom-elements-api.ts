/**
 * Spec-local helpers for the port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/custom-elements-api.cy.spec.ts
 *
 * Everything generic to the SDK-iframe tier lives in `support/sdk-iframe.ts`
 * (consumed read-only). Only two things are specific to this spec:
 *
 *  1. `loadedEmbedFrame` — the piece of `H.getSimpleEmbedIframeContent`'s
 *     contract that a bare `FrameLocator` does not carry. The Cypress helper
 *     BLOCKS on `iframe[data-metabase-embed]` and `iframe[data-iframe-loaded]`
 *     before it yields the body, so every assertion in the original — including
 *     each `should("not.exist")` — runs against an embed that has already
 *     reported loaded. A `FrameLocator` is lazy, so a naive port would take its
 *     absence assertions before the embed had rendered anything, making them
 *     vacuous. This helper restores the gate.
 *  2. `pasteText` — a port of the `cy.paste` custom command
 *     (e2e/support/commands/ui/paste.ts), used by the metabot scrolling test.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { getSimpleEmbedIframe, waitForSimpleEmbedIframesToLoad } from "./sdk-iframe";

/** Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
export const ORDERS_COUNT_QUESTION_ID: number = (() => {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === "Orders, Count",
  );
  if (!question) {
    throw new Error(
      'Question "Orders, Count" not found in cypress_sample_instance_data',
    );
  }
  return Number(question.id);
})();

/**
 * Port of `H.getSimpleEmbedIframeContent(index)`.
 *
 * The Cypress helper waits for `iframe[data-metabase-embed]` and
 * `iframe[data-iframe-loaded]` to outnumber `index` (40s) before returning the
 * iframe body. `count` is the number of embeds the page is expected to host —
 * upstream expresses this with an explicit
 * `H.waitForSimpleEmbedIframesToLoad(n)` on the one multi-embed test and leaves
 * it implicit (n = 1) everywhere else.
 */
export async function loadedEmbedFrame(
  page: Page,
  { index = 0, count = 1 }: { index?: number; count?: number } = {},
): Promise<FrameLocator> {
  await waitForSimpleEmbedIframesToLoad(page, count);
  return getSimpleEmbedIframe(page, index);
}

/**
 * Port of the `cy.paste(text)` custom command
 * (e2e/support/commands/ui/paste.ts): set the value through the native
 * input/textarea setter (so React's onChange sees it), dispatch `change`, then
 * dispatch a real `paste` ClipboardEvent for any onPaste handlers.
 *
 * Not `fill()`: `fill()` does not deliver a `paste` event, and the test this
 * serves (metabase#67399) is specifically about how the chat input reacts to a
 * large pasted block.
 */
export async function pasteText(locator: Locator, text: string) {
  await locator.evaluate((element, value) => {
    const prototype =
      element.nodeName === "INPUT"
        ? window.HTMLInputElement.prototype
        : element.nodeName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : undefined;

    if (!prototype) {
      throw new Error(`Unsupported node type: ${element.nodeName}`);
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
  }, text);
}
