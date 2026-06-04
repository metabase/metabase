// Builds an offscreen rounded clone of an element to use as the drag ghost.
// A live-element snapshot keeps square corners because the browser fills them
// with the element's background, so we clone, round, and rasterize a copy.
export function makeRoundedDragImage(source: HTMLElement): HTMLElement {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;

  // cloneNode doesn't carry canvas bitmaps, so chart previews would go blank —
  // copy each canvas' pixels across
  const sourceCanvases = source.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");
  sourceCanvases.forEach((sourceCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    const ctx = cloneCanvas?.getContext("2d");
    if (ctx) {
      cloneCanvas.width = sourceCanvas.width;
      cloneCanvas.height = sourceCanvas.height;
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  });

  Object.assign(clone.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    // keep it out of view while the browser rasterizes it
    transform: "translateY(-100%)",
    borderRadius: "var(--mantine-radius-md)",
    overflow: "hidden",
  });
  document.body.appendChild(clone);
  return clone;
}
