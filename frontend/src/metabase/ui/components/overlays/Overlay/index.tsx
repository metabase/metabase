import {
  Overlay as MantineOverlay,
  type OverlayProps,
  Portal,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";

export { type OverlayProps } from "@mantine/core";
export { getOverlayOverrides } from "./Overlay.styled";

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
