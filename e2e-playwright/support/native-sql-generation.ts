/**
 * Helpers for e2e/test/scenarios/metabot/native-sql-generation.cy.spec.ts.
 *
 * Metabot's inline SQL prompt: `$mod+Shift+i` in the native editor opens a
 * ProseMirror prompt; a canned SSE `code_edit` data part rewrites the editor
 * buffer, then accept/reject buttons commit or discard the proposed diff.
 *
 * The LLM is STUBBED via the shared support/metabot.ts SSE builders — no key,
 * fully jar-verifiable. The SSE body builders here are pure and reuse those
 * builders (createMetabotSSEBody / metabotDataPart / metabotTextPart).
 *
 * Only mockMetabotResponseWithDelay lives here rather than being taken from
 * support/metabot.ts: the shared mockMetabotResponse fulfils immediately, but
 * two tests need an in-flight window — one to observe the "generating" loader
 * (delay 100), one to cancel a pending request (delay 1000). The shared helper
 * is imported read-only (PORTING rule 9 forbids editing it), so the delayed
 * variant is local.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import {
  createMetabotSSEBody,
  metabotDataPart,
  metabotTextPart,
} from "./metabot";
import { focusNativeEditor } from "./native-editor";

// --- Inline-SQL-prompt locators (spec-local const helpers) -----------------

export function inlinePrompt(page: Page): Locator {
  return page.getByTestId("metabot-inline-sql-prompt");
}

/** inlinePrompt().find(".ProseMirror[contenteditable=true]") */
export function inlinePromptInput(page: Page): Locator {
  return inlinePrompt(page).locator(".ProseMirror[contenteditable=true]");
}

export function generateButton(page: Page): Locator {
  return page.getByTestId("metabot-inline-sql-generate");
}

export function cancelButton(page: Page): Locator {
  return page.getByTestId("metabot-inline-sql-cancel");
}

export function errorMessage(page: Page): Locator {
  return page.getByTestId("metabot-inline-sql-error");
}

export function acceptButton(page: Page): Locator {
  return page.getByTestId("accept-proposed-changes-button");
}

export function rejectButton(page: Page): Locator {
  return page.getByTestId("reject-proposed-changes-button");
}

export function generatingLoader(page: Page): Locator {
  return page.getByTestId("metabot-inline-sql-generating");
}

/**
 * Port of the spec-local toggleInlineSQLPrompt: focus the native editor, let it
 * settle (Cypress `cy.wait(250)`), then fire the `$mod+Shift+i` tinykeys binding
 * (H.metaKey + Shift + I) that toggles the inline prompt open/closed.
 */
export async function toggleInlineSQLPrompt(page: Page) {
  await focusNativeEditor(page);
  await page.waitForTimeout(250);
  await page.keyboard.press("ControlOrMeta+Shift+i");
}

/**
 * Click the ProseMirror prompt input, assert it took focus (PORTING rule 5),
 * then insert the text — the equivalent of `inlinePromptInput().click()` +
 * `cy.realType(text)`.
 */
export async function typeInlinePrompt(page: Page, text: string) {
  const input = inlinePromptInput(page);
  await input.click();
  await expect(input).toBeFocused();
  await page.keyboard.insertText(text);
}

// --- Canned SSE bodies (pure; reuse the shared builders) --------------------

/** Port of the spec-local mockCodeEditResponse. */
export function mockCodeEditResponse(sql: string): string {
  return createMetabotSSEBody(
    metabotDataPart("code_edit", {
      buffer_id: "qb",
      mode: "rewrite",
      value: sql,
    }),
  );
}

/** Port of the spec-local mockTextOnlyResponse. */
export function mockTextOnlyResponse(text: string): string {
  return createMetabotSSEBody(metabotTextPart(text));
}

// --- Delayed network mock --------------------------------------------------

/**
 * Like support/metabot.ts mockMetabotResponse, but holds the response for
 * `delay` ms so the caller can observe an in-flight request (the generating
 * loader) or cancel it. Fulfil is wrapped in try/catch: when the app aborts the
 * fetch (Cancel), the pending route errors on fulfil, which is expected.
 */
export async function mockMetabotResponseWithDelay(
  page: Page,
  { body, delay = 0 }: { body: string; delay?: number },
) {
  await page.route("**/api/metabot/agent-streaming", async (route) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body,
      });
    } catch {
      // The request was aborted client-side (Cancel) before we fulfilled it.
    }
  });
}

/** POST /api/metabot/agent-streaming — path predicate for waitForResponse. */
export function isAgentStreamingRequest(url: string): boolean {
  return new URL(url).pathname === "/api/metabot/agent-streaming";
}
