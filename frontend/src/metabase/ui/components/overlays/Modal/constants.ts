import type { ModalProps } from "@mantine/core";

export const NO_ANIMATION_MODAL_PROPS: Partial<ModalProps> = {
  transitionProps: { duration: 0 },
  styles: {
    overlay: { animation: "none" },
    content: { animation: "none" },
    inner: { animation: "none" },
  },
};

// Use on modals that embed a CodeMirror native editor (e.g. the action
// editor). The modal's enter animation leaves a `transform` on the content,
// which makes CodeMirror switch its autocomplete popup from `position: fixed`
// to `absolute` — and the popup then gets clipped by the editor's
// `overflow: hidden` wrappers. Disabling the animation removes the transform,
// so the popup stays `fixed` and renders fully.
export const PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS =
  NO_ANIMATION_MODAL_PROPS;
