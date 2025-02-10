import { Modal as MantineModal, type ModalProps } from "@mantine/core";
import type { ModalRootProps } from "@mantine/core/lib/Modal/ModalRoot/ModalRoot";
import _ from "underscore";

import { PreventEagerPortal } from "metabase/ui";

export type { ModalProps } from "@mantine/core";

export * from "./Modal.styled";

export const Modal = (props: ModalProps) => {
  return (
    <PreventEagerPortal {...props}>
      <MantineModal {...props} />
    </PreventEagerPortal>
  );
};

const ModalRoot = (props: ModalRootProps) => {
  const { withinPortal, ...rootProps } = props;
  return (
    <PreventEagerPortal {...props}>
      <MantineModal.Root {...rootProps} />
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
Modal.NativeScrollArea = MantineModal.NativeScrollArea;
