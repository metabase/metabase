/**
 * Helpers for the card-embed-node spec port. Ports of:
 * - e2e/support/document-initial-data.ts (the DOCUMENT_WITH_* fixtures, whose
 *   Cypress module imports through the "e2e/*" path alias — unusable from this
 *   project — so the two the spec uses are inlined here with ids looked up the
 *   same way sample-data.ts does)
 * - H.dragAndDropCardOnAnotherCard / documentsDragAndDrop (e2e-document-helpers.ts)
 * - H.documentUndo (e2e-document-helpers.ts)
 * - the spec-local assertFlexContainerCardsOrder / addNewStandaloneCard /
 *   getCardWidths, and the reviews-model fixture from the text-wrapping test
 *
 * The card drop is a native HTML5 drag processed by a ProseMirror plugin
 * (HandleEditorDrop): ProseMirror attaches its own dragstart/drop DOM
 * listeners on the editor root and reads the drop event's clientX to pick the
 * side, so the faithful port replays the exact same synthetic event sequence
 * the Cypress helper dispatches (mousedown → dragstart → mousemove → dragover
 * → mouseup → drop → dragend, sharing one DataTransfer) rather than
 * Playwright's real dnd, which cannot place the drop at a precise 20%/80%
 * offset on demand.
 */
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { captureNextAnchorClick } from "./click-behavior";
import { pickEntity } from "./dashboard";
import {
  addToDocument,
  commandSuggestionItem,
  documentContent,
  getDocumentCard,
} from "./documents-core";
import { expect } from "./fixtures";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "./sample-data";

const { REVIEWS_ID } = SAMPLE_DATABASE;

// === question ids (same lookup as sample-data.ts / cypress_sample_instance_data.js) ===

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(`Question "${name}" not found in cypress_sample_instance_data`);
  }
  return Number(question.id);
}

const ORDERS_QUESTION_ID = findQuestionId("Orders");
const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");
// ORDERS_BY_YEAR_QUESTION_ID imported from ./sample-data (canonical home).

// === document fixtures (e2e/support/document-initial-data.ts) ===

export const DOCUMENT_WITH_TWO_CARDS = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Testing drag and drop functionality" }],
      attrs: { _id: "1" },
    },
    {
      type: "resizeNode",
      attrs: { height: 350, minHeight: 280, _id: "2" },
      content: [
        {
          type: "cardEmbed",
          attrs: { id: ORDERS_QUESTION_ID, name: null, _id: "2a" },
        },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Some text between cards" }],
      attrs: { _id: "3" },
    },
    {
      type: "resizeNode",
      attrs: { height: 350, minHeight: 280, _id: "4" },
      content: [
        {
          type: "cardEmbed",
          attrs: { id: ORDERS_COUNT_QUESTION_ID, name: null, _id: "4a" },
        },
      ],
    },
    { type: "paragraph", attrs: { _id: "5" } },
  ],
};

export const DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Advanced drag and drop scenarios" }],
      attrs: { _id: "1" },
    },
    {
      type: "resizeNode",
      attrs: { height: 350, minHeight: 280, _id: "2" },
      content: [
        {
          type: "flexContainer",
          attrs: { _id: "2a" },
          content: [
            {
              type: "cardEmbed",
              attrs: { id: ORDERS_QUESTION_ID, name: null, _id: "2a1" },
            },
            {
              type: "cardEmbed",
              attrs: { id: ORDERS_COUNT_QUESTION_ID, name: null, _id: "2a2" },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Standalone card below" }],
      attrs: { _id: "3" },
    },
    {
      type: "resizeNode",
      attrs: { height: 350, minHeight: 280, _id: "4" },
      content: [
        {
          type: "cardEmbed",
          attrs: { id: ORDERS_BY_YEAR_QUESTION_ID, name: null, _id: "4a" },
        },
      ],
    },
    { type: "paragraph", attrs: { _id: "5" } },
  ],
};

// === card drag and drop ===

/** All flexContainers in the document body, in DOM order. */
export function flexContainers(page: Page): Locator {
  return documentContent(page).locator('[data-type="flexContainer"]');
}

/** The (single) flexContainer in the document body. */
export function flexContainer(page: Page): Locator {
  return flexContainers(page).first();
}

/**
 * Port of H.dragAndDropCardOnAnotherCard → documentsDragAndDrop. Replays the
 * Cypress helper's synthetic event sequence (a shared DataTransfer across
 * dragstart/dragover/drop, side computed as 20%/80% of the target width) so
 * the ProseMirror drop plugin sees exactly what it saw under Cypress.
 */
export async function dragAndDropCardOnAnotherCard(
  page: Page,
  sourceCardTitle: string,
  targetCardTitle: string,
  { side = "left" }: { side?: "left" | "right" } = {},
) {
  const source = getDocumentCard(page, sourceCardTitle);
  const target = getDocumentCard(page, targetCardTitle);
  const content = documentContent(page);

  await expect(source).toBeAttached();
  await expect(target).toBeAttached();

  const sourceEl = await source.elementHandle();
  const targetEl = await target.elementHandle();
  const contentEl = await content.elementHandle();
  if (!sourceEl || !targetEl || !contentEl) {
    throw new Error("Drag source/target/content not found");
  }

  await page.evaluate(
    ({ sourceEl, targetEl, contentEl, side }) => {
      const source = sourceEl as HTMLElement;
      const target = targetEl as HTMLElement;
      const content = contentEl as HTMLElement;

      const sourceRect = source.getBoundingClientRect();
      source.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: sourceRect.left + 10,
          clientY: sourceRect.top + 10,
        }),
      );

      const dataTransfer = new DataTransfer();
      source.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: sourceRect.left + 10,
          clientY: sourceRect.top + 10,
        }),
      );

      const targetRect = target.getBoundingClientRect();
      const sideX =
        targetRect.left + targetRect.width * (side === "left" ? 0.2 : 0.8);
      const centerY = targetRect.top + 10;

      content.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: sideX,
          clientY: centerY,
        }),
      );
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: sideX,
          clientY: centerY,
        }),
      );
      source.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          clientX: sideX,
          clientY: centerY,
        }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: sideX,
          clientY: centerY,
        }),
      );
      source.dispatchEvent(
        new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }),
      );
    },
    { sourceEl, targetEl, contentEl, side },
  );
}

/**
 * Port of H.documentUndo: focus the editor and press cmd/ctrl+z. Assert the
 * editor actually took focus before the keystroke (ProseMirror keyboard
 * handling runs at document.activeElement).
 */
export async function documentUndo(page: Page) {
  const editable = documentContent(page)
    .locator('[contenteditable="true"]')
    .first();
  // Click the top-left of the editor (the intro paragraph text), not the
  // center — the center sits over a card embed (contenteditable=false), whose
  // click does not move focus to the ProseMirror root, so cmd+z is dropped.
  await editable.click({ position: { x: 5, y: 5 } });
  await expect(editable).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
}

// === assertions ===

/**
 * Port of the spec-local assertFlexContainerCardsOrder. `scope` is the
 * flexContainer the upstream `.within()` established. `contain.text` is a
 * case-sensitive substring, so toContainText is faithful (including its
 * weakness that "Orders" matches "Orders, Count").
 */
export async function assertFlexContainerCardsOrder(
  scope: Locator,
  expectedCardTitles: string[],
) {
  const cards = scope.getByTestId("document-card-embed");
  await expect(cards).toHaveCount(expectedCardTitles.length);
  for (let i = 0; i < expectedCardTitles.length; i++) {
    await expect(
      cards.nth(i).getByTestId("card-embed-title"),
    ).toContainText(expectedCardTitles[i]);
  }
}

/**
 * Port of the spec-local addNewStandaloneCard: click the empty trailing
 * paragraph, open the "/" command, add a chart via Browse all.
 *
 * `.node-paragraph` and `.is-empty` are `:global` classes (Editor.module.css),
 * not CSS-module tokens, so they survive the production jar bundle.
 *
 * Opening the "/" command dialog is a race that only bites under CI load (the
 * documented ProseMirror focus/caret gotcha). Two mechanisms:
 *
 * 1. Existing card embeds load their queries asynchronously; when a card
 *    transitions loading -> loaded the editor re-renders and RESETS the
 *    ProseMirror selection. If that re-render lands between our click on the
 *    empty paragraph and the "/" keystroke, the caret is clobbered off the
 *    empty paragraph (observed: onto the end of the intro paragraph), where
 *    "/" is not a suggestion trigger — so the Command Dialog never opens and
 *    the "/" sticks as literal text. Wait for every embed to settle first so
 *    no re-render races the interaction.
 * 2. `page.keyboard` types at `document.activeElement` with no retry, so if the
 *    click didn't land focus the "/" goes to `<body>` and nothing is inserted.
 *
 * The Command extension is tiptap's `@tiptap/suggestion` with `char: "/"`, so
 * the dialog opens deterministically once "/" lands in an empty block. So:
 * settle the cards, assert the editor is focused before typing, then wrap
 * open-slash-menu + assert-dialog in a toPass loop — a dropped "/" inserts
 * nothing, leaving the empty paragraph in place to click again, so a missed
 * trigger self-heals (the re-nudge pattern PORTING.md prescribes for the editor
 * autocomplete).
 */
export async function addNewStandaloneCard(page: Page, cardName: string) {
  const editor = documentContent(page)
    .locator('[contenteditable="true"]')
    .first();
  const chartOption = commandSuggestionItem(page, "Chart");

  // No embed is mid-load (a loading card renders "Loading question..." and no
  // title): once none remain, the caret-clobbering re-renders are done.
  await expect(
    documentContent(page).getByText("Loading question...", { exact: true }),
  ).toHaveCount(0);

  await expect(async () => {
    // A prior attempt's "/" may have opened the dialog after we'd already
    // thrown — don't re-trigger on top of an open dialog.
    if (await chartOption.isVisible()) {
      return;
    }
    await page.locator(".node-paragraph.is-empty").first().click();
    await expect(editor).toBeFocused({ timeout: 5_000 });
    await addToDocument(page, "/", false);
    await expect(chartOption).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  await chartOption.click();
  await commandSuggestionItem(page, /Browse all/).click();
  await pickEntity(page, { path: ["Our analytics", cardName], select: true });
}

/**
 * Port of the spec-local getCardWidths: the content-box widths of each named
 * card embed, in order (jQuery .width() semantics).
 */
export async function getCardWidths(
  page: Page,
  cardNames: string[],
): Promise<number[]> {
  const widths: number[] = [];
  for (const name of cardNames) {
    widths.push(
      await getDocumentCard(page, name).evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          el.getBoundingClientRect().width -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth) -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        );
      }),
    );
  }
  return widths;
}

/** Chai's `closeTo(expected, delta)`: |actual - expected| <= delta. */
export function expectCloseTo(actual: number, expected: number, delta = 3) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(delta);
}

// === card-embed selection ===

/**
 * Port of `H.getDocumentCard(name).realClick({ position: "top" })`: click the
 * top-center of the card to select the cardEmbed node before deleting it.
 */
export async function selectCardEmbedFromTop(page: Page, name: string) {
  const card = getDocumentCard(page, name);
  const box = await card.boundingBox();
  if (!box) {
    throw new Error(`Card "${name}" not visible`);
  }
  await card.click({ position: { x: box.width / 2, y: 5 } });
}

// === anchor-click capture (open-in-new-tab tests) ===

type AnchorCaptureWindow = Window & {
  __capturedAnchor?: {
    href: string | null;
    rel: string | null;
    target: string | null;
  } | null;
};

export { captureNextAnchorClick };

/**
 * Assert the anchor captured by captureNextAnchorClick: href matches a regex,
 * rel/target are exact. Asserted OUTSIDE the click hook (per the porting rule:
 * a never-invoked hook must fail loudly), unlike upstream's callback-scoped
 * `expect(...).to.have.attr(...)` which is silently green if the click never
 * fires an anchor.
 */
export async function expectCapturedAnchor(
  page: Page,
  { href, rel, target }: { href: RegExp; rel: string; target: string },
) {
  await expect
    .poll(() =>
      page.evaluate(() => (window as AnchorCaptureWindow).__capturedAnchor),
    )
    .not.toBeNull();

  const captured = await page.evaluate(
    () => (window as AnchorCaptureWindow).__capturedAnchor,
  );

  expect(captured?.href ?? "").toMatch(href);
  expect(captured?.rel).toBe(rel);
  expect(captured?.target).toBe(target);
}

// === reviews model (text-wrapping test) ===

/**
 * Port of the text-wrapping test's inline H.createQuestion({ type: "model" })
 * with per-column widths and BODY text wrapping. documents-core's createCard
 * has no `type` field, so this posts /api/card directly.
 */
export async function createReviewsTextWrapModel(api: MetabaseApi) {
  const response = await api.post("/api/card", {
    name: "reviews",
    type: "model",
    display: "table",
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { "source-table": REVIEWS_ID },
    },
    visualization_settings: {
      "table.column_widths": [246, 195, 69, 116, 134, 83],
      column_settings: {
        '["name","BODY"]': { text_wrapping: true },
      },
    },
  });
  return (await response.json()) as { id: number };
}
