import {
  Modal as MantineModal,
  type ModalProps,
  type ModalRootProps,
} from "@mantine/core";

import { useDisableCommandPalette } from "metabase/palette/hooks/useDisableCommandPalette";
import { PreventEagerPortal } from "metabase/ui";

export type { ModalProps } from "@mantine/core";
export { useModalsStack } from "@mantine/core";

export * from "./Modal.config";

export const Modal = (props: ModalProps) => {
  useDisableCommandPalette({
    disabled: props.opened,
  });

  return (
    <PreventEagerPortal {...props}>
      <MantineModal {...props} />
    </PreventEagerPortal>
  );
};

const ModalRoot = (props: ModalRootProps) => {
  useDisableCommandPalette({
    disabled: props.opened,
  });
  return (
    <PreventEagerPortal>
      <MantineModal.Root {...props} />
    </PreventEagerPortal>
  );
};
Modal.Root = ModalRoot;
Modal.Overlay = MantineModal.Overlay;
Modal.Content = MantineModal.Content;
Modal.CloseButton = MantineModal.CloseButton;
Modal.Header = MantineModal.Header;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
// Modal.NativeScrollArea = MantineModal.NativeScrollArea;
