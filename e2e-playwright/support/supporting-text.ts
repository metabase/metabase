/**
 * Helpers for the supporting-text spec port. Ports of:
 * - DOCUMENT_WITH_SUPPORTING_TEXT (e2e/support/document-initial-data.ts, whose
 *   Cypress module imports through the "e2e/*" path alias — unusable from this
 *   project — so this one fixture is inlined here with ids looked up the same
 *   way card-embed-node.ts / sample-data.ts do).
 * - H.documentsDragAndDrop (e2e-document-helpers.ts) — the GENERIC drag whose
 *   source/target are arbitrary locators (card-embed-node.ts only ported the
 *   card-on-card specialization). Replays the Cypress helper's synthetic event
 *   sequence (a shared DataTransfer across dragstart/dragover/drop, side
 *   computed as 20%/80% of the target width) so the ProseMirror drop plugin
 *   sees exactly what it saw under Cypress.
 * - the spec-local getSupportingText / assertHorizontalLayout /
 *   assertVerticalLayout.
 *
 * DOCUMENT_WITH_TWO_CARDS / DOCUMENT_WITH_THREE_CARDS_AND_COLUMNS and
 * dragAndDropCardOnAnotherCard / flexContainer(s) / expectCloseTo /
 * getCardWidths are imported from card-embed-node.ts (same domain, just ported).
 */
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { documentContent, openDocumentCardMenu } from "./documents-core";
import { expect } from "./fixtures";
import { popover } from "./ui";

// === question ids (same lookup as card-embed-node.ts / sample-data.ts) ===

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

const ORDERS_QUESTION_ID = findQuestionId("Orders");
const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");

// === document fixture (e2e/support/document-initial-data.ts) ===

export const DOCUMENT_WITH_SUPPORTING_TEXT = {
  type: "doc" as const,
  content: [
    {
      type: "resizeNode",
      attrs: { height: 350, minHeight: 280, _id: "1" },
      content: [
        {
          type: "flexContainer",
          attrs: {
            _id: "1a",
            columnWidths: [33.33333333333333, 66.66666666666666],
          },
          content: [
            {
              type: "supportingText",
              attrs: { _id: "1b" },
              content: [
                {
                  type: "paragraph",
                  attrs: { _id: "1c" },
                  content: [{ type: "text", text: "Lorem ipsum" }],
                },
              ],
            },
            {
              type: "cardEmbed",
              attrs: { id: ORDERS_QUESTION_ID, name: null, _id: "2a2" },
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
          attrs: { id: ORDERS_COUNT_QUESTION_ID, name: null, _id: "4a" },
        },
      ],
    },
    { type: "paragraph", attrs: { _id: "5" } },
  ],
};

// === supporting text locators ===

export const SUPPORTING_TEXT_TESTID = "document-card-supporting-text";

export function supportingText(page: Page): Locator {
  return documentContent(page).getByTestId(SUPPORTING_TEXT_TESTID);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the spec-local getSupportingText: `findAllByTestId(testId)
 * .contains(contents).closest([data-testid])`. `.contains` is a case-sensitive
 * substring, so the supporting-text block filtered by a case-sensitive regex is
 * faithful.
 */
export function getSupportingText(
  page: Page,
  contents = "Lorem ipsum",
): Locator {
  return supportingText(page).filter({
    hasText: new RegExp(escapeRegExp(contents)),
  });
}

/**
 * The "Add supporting text" item in the card menu (findByText string is exact).
 * Its enclosing button carries `data-disabled` when the option is unavailable.
 */
export function addSupportingTextMenuItem(page: Page): Locator {
  return popover(page).getByText("Add supporting text", { exact: true });
}

/**
 * Open the card menu, click "Add supporting text", and assert the supporting
 * text block appeared.
 */
export async function addSupportingText(page: Page, cardName: string) {
  await openDocumentCardMenu(page, cardName);
  await addSupportingTextMenuItem(page).click();
  await expect(supportingText(page)).toBeAttached();
}

/**
 * Click into the supporting text's paragraph and confirm the ProseMirror root
 * took focus before any keystrokes (page.keyboard types at
 * document.activeElement with no retry — see the ProseMirror focus gotcha).
 */
export async function clickIntoSupportingText(page: Page) {
  await supportingText(page).locator(".node-paragraph").first().click();
  await expect(
    documentContent(page).locator('[contenteditable="true"]').first(),
  ).toBeFocused();
}

// === generic document drag and drop (H.documentsDragAndDrop) ===

/**
 * Port of H.documentsDragAndDrop. Replays the Cypress helper's synthetic event
 * sequence with a shared DataTransfer, dispatching dragstart on the source and
 * dragover/drop on the target at the 20%/80% side offset the ProseMirror drop
 * plugin reads from clientX. `getSource`/`getTarget` return Locators (a card, a
 * supporting-text block, or a supporting-text drag handle).
 */
export async function documentsDragAndDrop(
  page: Page,
  {
    getSource,
    getTarget,
    side = "left",
  }: {
    getSource: () => Locator;
    getTarget: () => Locator;
    side?: "left" | "right";
  },
) {
  const source = getSource();
  const target = getTarget();
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
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    { sourceEl, targetEl, contentEl, side },
  );
}

// === layout assertions (spec-local) ===

async function boundingRect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Element is not visible for layout assertion");
  }
  return {
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
  };
}

/** Port of the spec-local assertHorizontalLayout (c2 is to the right of c1). */
export async function assertHorizontalLayout(c1: Locator, c2: Locator) {
  const rect1 = await boundingRect(c1);
  const rect2 = await boundingRect(c2);
  expect(rect2.left).toBeGreaterThanOrEqual(rect1.right);
  expect(Math.abs(rect1.top - rect2.top)).toBeLessThanOrEqual(2);
}

/** Port of the spec-local assertVerticalLayout (c2 is below c1). */
export async function assertVerticalLayout(c1: Locator, c2: Locator) {
  const rect1 = await boundingRect(c1);
  const rect2 = await boundingRect(c2);
  expect(rect2.top).toBeGreaterThanOrEqual(rect1.bottom);
  expect(Math.abs(rect1.left - rect2.left)).toBeLessThanOrEqual(2);
}
