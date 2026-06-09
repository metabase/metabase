import {
  Modal as MantineModal,
  type ModalProps,
  type ModalRootProps,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";
import { useDisableCommandPalette } from "metabase/ui/hooks/use-disable-command-palette";

import { useModalCloseHandler } from "./use-modal-close-handler";

export type { ModalProps } from "@mantine/core";
export { useModalsStack } from "@mantine/core";

export * from "./Modal.config";

export function Modal(props: ModalProps) {
  useDisableCommandPalette({
    disabled: props.opened,
  });

  const modalRef = useModalCloseHandler({
    opened: props.opened,
    onClose: props.onClose,
    closeOnClickOutside: props.closeOnClickOutside ?? true,
    closeOnEscape: props.closeOnEscape ?? true,
  });

  return (
    <PreventEagerPortal {...props}>
      <MantineModal
        {...props}
        ref={modalRef}
        closeOnClickOutside={false}
        closeOnEscape={false}
      />
    </PreventEagerPortal>
  );
}

function ModalRoot(props: ModalRootProps) {
  useDisableCommandPalette({
    disabled: props.opened,
  });
  return (
    <PreventEagerPortal>
      <MantineModal.Root {...props} />
    </PreventEagerPortal>
  );
}
Modal.Root = ModalRoot;
Modal.Overlay = MantineModal.Overlay;
Modal.Content = MantineModal.Content;
Modal.CloseButton = MantineModal.CloseButton;
Modal.Header = MantineModal.Header;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
// Modal.NativeScrollArea = MantineModal.NativeScrollArea;
