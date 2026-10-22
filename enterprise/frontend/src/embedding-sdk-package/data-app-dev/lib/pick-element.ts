import type { DataAppCommentRect } from "../types/comments";

/** Marks the dev chrome, so the picker never offers its own UI as a target. */
export const DEV_CHROME_ATTRIBUTE = "data-data-app-dev-chrome";

const DEV_CHROME_SELECTOR = `[${DEV_CHROME_ATTRIBUTE}]`;

const isInsideApp = (element: Element, rootElement: Element | null): boolean =>
  !element.closest(DEV_CHROME_SELECTOR) &&
  (rootElement === null || rootElement.contains(element));

/**
 * The app element under the pointer.
 *
 * `elementsFromPoint` returns everything under the point, topmost first, so the
 * picker's own full-screen overlay can stay interactive — it is simply skipped,
 * along with the rest of the dev chrome, instead of being toggled out of the way
 * on every mouse move.
 */
export const findAppElementAtPoint = (
  x: number,
  y: number,
  rootElement: Element | null,
): Element | null =>
  document
    .elementsFromPoint(x, y)
    .find((element) => isInsideApp(element, rootElement)) ?? null;

const contains = (outer: DOMRect, inner: DataAppCommentRect): boolean =>
  outer.left <= inner.x &&
  outer.top <= inner.y &&
  outer.right >= inner.x + inner.width &&
  outer.bottom >= inner.y + inner.height;

/**
 * The innermost app element that fully contains the dragged rectangle — the
 * node an author means when they draw a box around several things, since it is
 * the smallest part of the app that holds all of them.
 *
 * Returns `null` when nothing of the app is under the rectangle's centre.
 */
export const findRegionAnchor = (
  region: DataAppCommentRect,
  rootElement: Element | null,
): Element | null => {
  const centre = findAppElementAtPoint(
    region.x + region.width / 2,
    region.y + region.height / 2,
    rootElement,
  );

  for (let element = centre; element; element = element.parentElement) {
    if (!isInsideApp(element, rootElement)) {
      return null;
    }

    if (contains(element.getBoundingClientRect(), region)) {
      return element;
    }
  }

  return centre;
};
