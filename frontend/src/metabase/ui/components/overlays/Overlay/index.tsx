import {
  Overlay as MantineOverlay,
  type OverlayProps,
  Portal,
} from "@mantine/core";

import { Guard } from "../Guard";
export { type OverlayProps } from "@mantine/core";
export { getOverlayOverrides } from "./Overlay.styled";

export const Overlay = (props: OverlayProps) => {
  return (
    <Guard {...props}>
      <Portal>
        <MantineOverlay {...props} />
      </Portal>
    </Guard>
  );
};
