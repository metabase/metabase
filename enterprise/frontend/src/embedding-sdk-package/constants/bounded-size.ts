// EMB-875: these match `FlexibleSizeComponent` on the bundle side, so the
// package-side loader/error box — and the data-app mediated-mount container —
// occupy the same box the SDK component will occupy once it renders, preventing
// a position shift when the bundle finishes loading.
export const DEFAULT_BOUNDED_HEIGHT = "600px";
export const DEFAULT_BOUNDED_WIDTH = "100%";
