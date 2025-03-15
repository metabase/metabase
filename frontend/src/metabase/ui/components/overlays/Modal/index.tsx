import {
  Modal as MantineModal,
  type ModalProps,
  type ModalRootProps,
  useModalStackContext,
} from "@mantine/core";
import { useState } from "react";
import { useUnmount } from "react-use";

import { useUniqueId } from "metabase/hooks/use-unique-id";
import { PreventEagerPortal } from "metabase/ui";

export type { ModalProps } from "@mantine/core";
export { useModalStackContext } from "@mantine/core";

export * from "./Modal.config";

const _Modal = (props: ModalProps) => {
  const ctx = useModalStackContext();
  const identifier = useUniqueId("modal-");
  const [_stackId] = useState(props.stackId ?? identifier);

  useUnmount(() => {
    if (ctx) {
      ctx?.removeModal(_stackId);
    }
  });

  return <MantineModal {...props} stackId={_stackId} />;
};

export const Modal = (props: ModalProps) => {
  return (
    <PreventEagerPortal {...props}>
      <_Modal {...props} />
    </PreventEagerPortal>
  );
};

const ModalRoot = (props: ModalRootProps) => (
  <PreventEagerPortal>
    <MantineModal.Root {...props} />
  </PreventEagerPortal>
);

Modal.Root = ModalRoot;
Modal.Overlay = MantineModal.Overlay;
Modal.Content = MantineModal.Content;
Modal.CloseButton = MantineModal.CloseButton;
Modal.Header = MantineModal.Header;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
Modal.Stack = MantineModal.Stack;
// Modal.NativeScrollArea = MantineModal.NativeScrollArea;
