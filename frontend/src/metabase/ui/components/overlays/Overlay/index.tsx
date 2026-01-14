import {
  Overlay as MantineOverlay,
  type OverlayProps,
  Portal,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";

export type { OverlayProps, ModalOverlayProps } from "@mantine/core";
export { LoadingOverlay } from "@mantine/core";
export { overlayOverrides } from "./Overlay.config";

/**
 * A Mantine Overlay is a translucent backdrop that covers the whole viewport.
 * Note that in our codebase the word overlay is often used more broadly to
 * refer to any element that floats above the normal content, such as a modal
 * or tooltip.
 * */
export const Overlay = (props: OverlayProps) => {
  return (
    <PreventEagerPortal {...props}>
      <Portal>
        <MantineOverlay {...props} />
      </Portal>
    </PreventEagerPortal>
  );
};
