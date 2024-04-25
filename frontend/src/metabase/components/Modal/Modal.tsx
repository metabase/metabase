import type { FullPageModalProps } from "metabase/components/Modal/FullPageModal";
import { RoutelessFullPageModal } from "metabase/components/Modal/RoutelessFullPageModal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";

const Modal = ({
  full = false,
  ...props
}: {
  full?: boolean;
  isOpen?: boolean;
} & (WindowModalProps & FullPageModalProps)) => {
  if (full) {
    return props.isOpen ? <RoutelessFullPageModal {...props} /> : null;
  } else {
    return <WindowModal {...props} />;
  }
};

Modal.defaultProps = {
  isOpen: true,
};

export { Modal };
