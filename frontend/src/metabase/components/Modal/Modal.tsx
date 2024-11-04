import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";

export type ModalProps = WindowModalProps;

const Modal = ({ isOpen = true, ...props }: ModalProps) => {
  return <WindowModal isOpen={isOpen} {...props} />;
};

export { Modal };
