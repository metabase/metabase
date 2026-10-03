/**
 * Helpers for tests/native-reproductions.spec.ts — the `H` helpers that
 * e2e/test/scenarios/native/native-reproductions.cy.spec.ts needs and that the
 * shared support modules don't cover yet. Per the parallel-agent rule these
 * live here rather than in the shared modules.
 *
 * Ports of:
 * - H.startNewNativeModel                (e2e-ad-hoc-question-helpers.js)
 * - H.startNewNativeQuestion({database: null})  — the shared
 *   native-editor.ts port types `database` as `number | undefined`, and its
 *   `= SAMPLE_DB_ID` default only fires for `undefined`, so an explicit
 *   `null` (the "no database picked yet" case issue 57644 depends on) can't
 *   be expressed through it.
 * - H.NativeEditor.type(text, { allowFastSet: true })  (e2e-codemirror-helpers.ts)
 * - H.NativeEditor.blur()                (e2e-codemirror-helpers.ts)
 * - H.NativeEditor.selectAll()           (e2e-codemirror-helpers.ts)
 * - H.createTestNativeQuery              (api/createTestQuery.ts)
 * - H.createCard                         (api/createCard.ts)
 * - H.assertDescendantNotOverflowsContainer (e2e-ui-elements-overflow-helpers.js)
 * - H.repeatAssertion                    (e2e-ui-elements-helpers.js)
 * - Cypress `.trigger("mousedown"|"mousemove"|"mouseup", x, y, opts)` — a
 *   synthetic MouseEvent dispatch, NOT a real mouse drag.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { adhocQuestionHash, focusNativeEditor, nativeEditor } from "./native-editor";
import { SAMPLE_DB_ID } from "./sample-data";

/**
 * Port of H.startNewNativeModel: the hash clicking "New" > "Model" >
 * "Use a native query" generates, visited at /model/query#<hash>.
 */
export async function startNewNativeModel(
  page: Page,
  { database = SAMPLE_DB_ID, query = "" }: { database?: number; query?: string } = {},
) {
  const card = {
    collection_id: null,
    dataset_query: {
      database,
      native: { query, "template-tags": {} },
      type: "native",
    },
    display: "scalar",
    parameters: [],
    visualization_settings: {},
    type: "model",
  };
  await page.goto(`/model/query#${adhocQuestionHash(card)}`);
}

/**
 * Port of H.startNewNativeQuestion({ database: null, query: "" }) — the
 * "no database selected yet" entry point issue 57644 tests.
 */
export async function startNewNativeQuestionWithoutDatabase(page: Page) {
  const card = {
    collection_id: null,
    dataset_query: {
      database: null,
      native: { query: "", "template-tags": {} },
      type: "native",
    },
    display: "scalar",
    parameters: [],
    visualization_settings: {},
    type: "question",
  };
  await page.goto(`/question#${adhocQuestionHash(card)}`);
}

/**
 * Port of H.NativeEditor.type(text, { allowFastSet: true }).
 *
 * The Cypress helper does NOT type this text: it focuses, then
 * `helpers.get().invoke("text", text)` — a jQuery `.text()` write straight
 * onto `.cm-content` — and then types " {backspace}" to make CodeMirror
 * notice the DOM mutation and re-run its validator. Reproduced verbatim,
 * because the strings it is used for (`{{#12-reference-question }}`,
 * `{{ snippet: A and B }}`) go through close-brackets/autocomplete when
 * typed, which is exactly what upstream is dodging.
 */
export async function fastSetNativeEditor(page: Page, text: string) {
  await focusNativeEditor(page);
  await nativeEditor(page).evaluate((element, value) => {
    element.textContent = value;
  }, text);
  // `helpers.type(" {backspace}")` — focuses again, types a space, backspaces.
  await focusNativeEditor(page);
  await page.keyboard.type(" ", { delay: 10 });
  await page.keyboard.press("Backspace");
}

/** Port of H.NativeEditor.blur(): jQuery `.blur()` on `.cm-content`. */
export async function blurNativeEditor(page: Page) {
  await nativeEditor(page).evaluate((element) => element.blur());
}

/** Port of H.NativeEditor.selectAll(): focus, then cmd/ctrl+A. */
export async function selectAllInNativeEditor(page: Page) {
  await focusNativeEditor(page);
  await page.keyboard.press("ControlOrMeta+a");
}

/**
 * Port of `{nextcompletion}` in H.NativeEditor.type: a 50ms settle, then
 * cmd/ctrl+j. Note the settle is a real wait — `press(key, { delay })` is the
 * keydown→keyup hold, not a gap between presses (PORTING, corrected 2026-07-20).
 */
export async function pressNextCompletion(page: Page) {
  await page.waitForTimeout(50);
  await page.keyboard.press("ControlOrMeta+j");
}

/** Port of H.createTestNativeQuery (api/createTestQuery.ts). */
export async function createTestNativeQuery(
  api: MetabaseApi,
  querySpec: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await api.post("/api/testing/native-query", querySpec);
  return (await response.json()) as Record<string, unknown>;
}

/** Port of H.createCard (api/createCard.ts) including its DEFAULT_CARD_DETAILS. */
export async function createCard(
  api: MetabaseApi,
  details: Record<string, unknown>,
): Promise<{ id: number }> {
  const response = await api.post("/api/card", {
    name: "Test card",
    display: "table",
    visualization_settings: {},
    ...details,
  });
  return (await response.json()) as { id: number };
}

/**
 * Port of H.assertDescendantNotOverflowsContainer applied to every descendant
 * of the `descendantRootTestId` element, measured against the
 * `containerTestId` element in ONE page-side evaluate. Returns the offending
 * descendants (zero-sized ones are skipped, exactly like the Cypress helper).
 *
 * Two porting notes:
 * - `boundingBox()` is a second round trip that returns null on re-render, so
 *   both rects are read inside the evaluate (PORTING).
 * - The Cypress original is a `.should(cb)`, i.e. retried; the caller wraps
 *   this in `expect(...).toPass()`.
 */
export async function findOverflowingDescendants(
  page: Page,
  containerTestId: string,
  descendantRootTestId: string,
): Promise<string[]> {
  return page.evaluate(
    ({ containerTestId, descendantRootTestId }) => {
      const container = document.querySelector(
        `[data-testid="${containerTestId}"]`,
      );
      const root = document.querySelector(
        `[data-testid="${descendantRootTestId}"]`,
      );
      if (!container || !root) {
        throw new Error(
          `missing ${!container ? containerTestId : descendantRootTestId}`,
        );
      }
      const containerRect = container.getBoundingClientRect();
      const problems: string[] = [];
      root.querySelectorAll("*").forEach((descendant) => {
        const rect = descendant.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) {
          return;
        }
        const describe = (side: string) =>
          `${descendant.tagName.toLowerCase()}.${descendant.className || "(no class)"} ${side}`;
        if (rect.bottom > containerRect.bottom) {
          problems.push(describe("bottom"));
        }
        if (rect.top < containerRect.top) {
          problems.push(describe("top"));
        }
        if (rect.left < containerRect.left) {
          problems.push(describe("left"));
        }
        if (rect.right > containerRect.right) {
          problems.push(describe("right"));
        }
      });
      return problems;
    },
    { containerTestId, descendantRootTestId },
  );
}

/** jQuery `.outerWidth()` / `.outerHeight()` — the element's border box. */
export async function outerSize(
  locator: Locator,
): Promise<{ width: number; height: number }> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

type TriggerOptions = {
  /** Element-relative x. Cypress's `.trigger(name, x, y)` signature. */
  x?: number;
  /** Element-relative y. */
  y?: number;
  /** Absolute viewport coordinates (Cypress's `{ clientX, clientY }` form). */
  clientX?: number;
  clientY?: number;
  button?: number;
};

/**
 * Port of Cypress `.trigger("mousedown"|"mousemove"|"mouseup", ...)`: a
 * synthetic, bubbling MouseEvent dispatched AT the element.
 *
 * This is deliberately not `page.mouse.*`: Cypress never moves a real cursor,
 * and a real drag here would hit the "a real hover can create the overlay that
 * intercepts its own click" class of problem (PORTING). The resize/reorder
 * handlers listen on the document, so bubbling from the element reaches them.
 */
export async function triggerMouseEvent(
  locator: Locator,
  type: "mousedown" | "mousemove" | "mouseup",
  options: TriggerOptions = {},
) {
  await locator.evaluate(
    (element, { type, x, y, clientX, clientY, button }) => {
      const rect = element.getBoundingClientRect();
      const resolvedX = clientX ?? rect.left + (x ?? rect.width / 2);
      const resolvedY = clientY ?? rect.top + (y ?? rect.height / 2);
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          button: button ?? 0,
          buttons: type === "mouseup" ? 0 : 1,
          clientX: resolvedX,
          clientY: resolvedY,
        }),
      );
    },
    { type, ...options },
  );
}

/** The viewport rect of an element, read page-side in one round trip. */
export async function clientRect(locator: Locator) {
  return locator.evaluate((element) => {
    const { x, y, width, height, bottom, right } =
      element.getBoundingClientRect();
    return { x, y, width, height, bottom, right };
  });
}

/**
 * Port of H.repeatAssertion(assertFn, timeout = 4000, interval = 400): run the
 * assertion, sleep, repeat until the budget is spent. Upstream uses it to give
 * a transient state time to appear — so unlike a `toPass` loop, EVERY
 * iteration must pass.
 */
export async function repeatAssertion(
  page: Page,
  assertion: () => Promise<void>,
  { timeout = 4000, interval = 400 }: { timeout?: number; interval?: number } = {},
) {
  let remaining = timeout;
  while (remaining > 0) {
    await assertion();
    await page.waitForTimeout(interval);
    remaining -= interval;
  }
}

/** Port of `cy.findByTestId("native-query-editor-container").findByTestId("run-button")`. */
export function getRunQueryButton(page: Page): Locator {
  return page
    .getByTestId("native-query-editor-container")
    .getByTestId("run-button");
}

/** Port of H.nativeEditorDataSource(): `findAllByTestId("gui-builder-data").first()`. */
export function nativeEditorDataSource(page: Page): Locator {
  return page.getByTestId("gui-builder-data").first();
}

/** Assert the play icon is gone — the tail of H.runNativeQuery, which runs
 * even with `{ wait: false }`. */
export async function expectNotDirty(page: Page) {
  await expect(page.locator(".Icon-play")).toHaveCount(0);
}
