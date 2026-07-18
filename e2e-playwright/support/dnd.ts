/**
 * Canonical synthetic dnd-kit draggers, consolidated from the per-module copies
 * (pivot-tables `moveDnDKitPointer`, table-column-settings `moveDnDKitColumnHeader`
 * — byte-identical — and question-settings `moveDnDKitElementSynthetic`).
 *
 * Two distinct helpers, because they drive different dnd-kit sensors and are NOT
 * interchangeable:
 * - `moveDnDKitPointer` drives the PointerSensor with PointerEvents, re-reading
 *   the element's box before EVERY event so a handle whose `left` slides mid-drag
 *   (pivot resize handle, sortable column header) gets offsets relative to its
 *   current position.
 * - `moveDnDKitElementSynthetic` drives the MouseSensor with MouseEvents in a
 *   single in-page evaluate (offsets from the element's original position), for
 *   drag targets clipped by / below a scroll container's fold where a real mouse
 *   press can't land.
 *
 * The real-mouse draggers (`moveDnDKitElementOnto` in dashboard-cards.ts,
 * `moveDnDKitListElement` in actions-on-dashboards.ts) stay where they are — they
 * are the default for visible targets and are not synthetic.
 */
import type { Locator } from "@playwright/test";

/**
 * Drive dnd-kit's PointerSensor with synthetic pointer events at element-relative
 * offsets: pointerdown at the element's top-left, a threshold-exceeding move at
 * (+20, +20), the offset move at (horizontal, vertical), then pointerup on the
 * document. Re-reads the bounding box before every event, so a handle whose
 * position slides mid-drag gets offsets relative to its CURRENT top-left (which
 * for a resize handle intentionally compounds the delta).
 */
export async function moveDnDKitPointer(
  element: Locator,
  { horizontal = 0, vertical = 0 }: { horizontal?: number; vertical?: number },
) {
  const page = element.page();

  const dispatch = (
    type: string,
    clientX: number,
    clientY: number,
    onDocument = false,
  ) =>
    element.evaluate(
      (el, args) => {
        const target = args.onDocument ? document : el;
        target.dispatchEvent(
          new PointerEvent(args.type, {
            bubbles: true,
            cancelable: true,
            clientX: args.clientX,
            clientY: args.clientY,
            button: 0,
            buttons: args.type === "pointerup" ? 0 : 1,
            isPrimary: true,
            pointerId: 1,
          }),
        );
      },
      { type, clientX, clientY, onDocument },
    );

  const boxAt = async () => {
    const box = await element.boundingBox();
    if (!box) {
      throw new Error("moveDnDKitPointer: missing bounding box");
    }
    return box;
  };

  let box = await boxAt();
  await dispatch("pointerdown", box.x, box.y);
  await page.waitForTimeout(200);

  box = await boxAt();
  await dispatch("pointermove", box.x + 20, box.y + 20);
  await page.waitForTimeout(200);

  box = await boxAt();
  const finalX = box.x + horizontal;
  const finalY = box.y + vertical;
  await dispatch("pointermove", finalX, finalY);
  await page.waitForTimeout(200);

  await dispatch("pointerup", finalX, finalY, true);
  await page.waitForTimeout(200);
}

/**
 * Synthetic-event port of H.moveDnDKitElementByAlias({ useMouseEvents }) for drag
 * targets that sit below the scroll container's fold: a real mouse press on
 * clipped coordinates lands on whatever covers them and the drag never starts,
 * while Cypress's trigger() dispatches straight on the element. Mirrors the
 * Cypress sequence exactly — mousedown at the element's top-left, a 20,20
 * activation move, a move to the offset, and a document-level mouseup, with 200ms
 * pauses so dnd-kit's autoscroller gets time to run.
 */
export async function moveDnDKitElementSynthetic(
  element: Locator,
  { horizontal = 0, vertical = 0 }: { horizontal?: number; vertical?: number },
) {
  await element.evaluate(
    async (el, { horizontal, vertical }) => {
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const options = { bubbles: true, cancelable: true, button: 0 };
      const { x, y } = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("mousedown", { ...options, clientX: x, clientY: y }),
      );
      await sleep(200);
      // This initial move needs to be greater than the activation
      // constraint of the sensor.
      el.dispatchEvent(
        new MouseEvent("mousemove", {
          ...options,
          clientX: x + 20,
          clientY: y + 20,
        }),
      );
      await sleep(200);
      el.dispatchEvent(
        new MouseEvent("mousemove", {
          ...options,
          clientX: x + horizontal,
          clientY: y + vertical,
        }),
      );
      await sleep(200);
      document.dispatchEvent(
        new MouseEvent("mouseup", {
          ...options,
          clientX: x + horizontal,
          clientY: y + vertical,
        }),
      );
      await sleep(200);
    },
    { horizontal, vertical },
  );
}
