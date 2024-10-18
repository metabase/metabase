import type { FullPageModalProps } from "metabase/components/Modal/FullPageModal";
import { RoutelessFullPageModal } from "metabase/components/Modal/RoutelessFullPageModal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";

export type ModalProps = {
  full?: boolean;
  isOpen?: boolean;
} & Omit<WindowModalProps & FullPageModalProps, "isOpen">;

const Modal = ({ full = false, isOpen = true, ...props }: ModalProps) => {
  if (full) {
    return isOpen ? <RoutelessFullPageModal {...props} /> : null;
  } else {
    return <WindowModal isOpen={isOpen} {...props} />;
  }
};

export { Modal };
