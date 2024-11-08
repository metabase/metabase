import { Modal as MantineModal, type ModalProps } from "@mantine/core";
import type { ModalRootProps } from "@mantine/core/lib/Modal/ModalRoot/ModalRoot";

import { Guard } from "../Guard";
export type { ModalProps } from "@mantine/core";

export * from "./Modal.styled";

export const Modal = (props: ModalProps) => (
  <Guard {...props}>
    <MantineModal {...props} />
  </Guard>
);

const ModalRoot = (props: ModalRootProps) => (
  <Guard>
    <MantineModal.Root {...props} />
  </Guard>
);

Modal.Root = ModalRoot;
Modal.Overlay = MantineModal.Overlay;
Modal.Content = MantineModal.Content;
Modal.CloseButton = MantineModal.CloseButton;
Modal.Header = MantineModal.Header;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
Modal.NativeScrollArea = MantineModal.NativeScrollArea;
