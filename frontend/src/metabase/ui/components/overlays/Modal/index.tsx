import {
  Modal as MantineModal,
  type ModalProps,
  type ModalRootProps,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";
import { useGatedCloseProps } from "metabase/ui/components/overlays/overlay-stack";
import { useDisableCommandPalette } from "metabase/ui/hooks/use-disable-command-palette";

export type { ModalProps } from "@mantine/core";
export { useModalsStack } from "@mantine/core";

export * from "./Modal.config";
export * from "./constants";

export function Modal(props: ModalProps) {
  const closeProps = useGatedCloseProps(props);

  useDisableCommandPalette({
    disabled: props.opened,
  });

  return (
    <PreventEagerPortal {...props}>
      <MantineModal
        {...props}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      />
    </PreventEagerPortal>
  );
}

function ModalRoot(props: ModalRootProps) {
  const closeProps = useGatedCloseProps(props);

  useDisableCommandPalette({
    disabled: props.opened,
  });
  return (
    <PreventEagerPortal>
      <MantineModal.Root
        {...props}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      />
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
