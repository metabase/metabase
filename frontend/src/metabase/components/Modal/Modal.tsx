import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";

const Modal = ({ isOpen = true, ...props }: WindowModalProps) => {
  return <WindowModal isOpen={isOpen} {...props} />;
};

export { Modal };
