import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";
import { useDisableCommandPalette } from "metabase/palette/hooks/useDisableCommandPalette";

export type ModalProps = WindowModalProps;

/** @deprecated use Modal from metabase/ui */
const Modal = ({ isOpen = true, ...props }: ModalProps) => {
  useDisableCommandPalette({ disabled: isOpen });
  return <WindowModal isOpen={isOpen} {...props} />;
};

export { Modal };
