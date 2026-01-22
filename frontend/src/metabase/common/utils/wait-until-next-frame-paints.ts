// Double rAF is needed here to ensure we actually paint the next frame.
// First rAF will be called on the next frame BEFORE painting,
// and the second rAF is scheduled to run AFTER the first frame is painted, but BEFORE the next frame is painted.
export function waitUntilNextFramePainted() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(async () => {
      requestAnimationFrame(async () => {
        resolve();
      });
    });
  });
}
