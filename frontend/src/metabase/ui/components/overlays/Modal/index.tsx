import { Modal as MantineModal, type ModalProps } from "@mantine/core";
import type { ModalRootProps } from "@mantine/core/lib/Modal/ModalRoot/ModalRoot";

import { withLazyPortal } from "../utils";
export type { ModalProps } from "@mantine/core";

export * from "./Modal.styled";

export function Modal(props: ModalProps) {
  return <MantineModal {...withLazyPortal(props)} />;
}

const ModalRoot = (props: ModalRootProps) => {
  return <MantineModal.Root {...withLazyPortal(props)} />;
};

Modal.Root = ModalRoot;
Modal.Overlay = MantineModal.Overlay;
Modal.Content = MantineModal.Content;
Modal.CloseButton = MantineModal.CloseButton;
Modal.Header = MantineModal.Header;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
Modal.NativeScrollArea = MantineModal.NativeScrollArea;
