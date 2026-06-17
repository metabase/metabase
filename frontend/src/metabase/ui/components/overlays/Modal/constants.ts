import type { ModalProps } from "@mantine/core";

export const NO_ANIMATION_MODAL_PROPS: Partial<ModalProps> = {
  transitionProps: { duration: 0 },
  styles: {
    overlay: { animation: "none" },
    content: { animation: "none" },
    inner: { animation: "none" },
  },
};
