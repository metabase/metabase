import React from "react";
import { RoutelessFullPageModal } from "metabase/components/Modal/RoutelessFullPageModal";
import {
  WindowModal,
  WindowModalProps,
} from "metabase/components/Modal/WindowModal";
import type { FullPageModalProps } from "metabase/components/Modal/FullPageModal";

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
