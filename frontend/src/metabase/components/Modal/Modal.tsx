import React from "react";
import { RoutelessFullPageModal } from "metabase/components/Modal/RoutelessFullPageModal";
import {
  WindowModal,
  WindowModalProps,
} from "metabase/components/Modal/WindowModal";
import { FullPageModalProps } from "metabase/components/Modal/FullPageModal";

const Modal = ({
  full = false,
  ...props
}: {
  full?: boolean;
  isOpen?: boolean;
} & (WindowModalProps & FullPageModalProps)) =>
  full ? (
    props.isOpen ? (
      <RoutelessFullPageModal {...props} />
    ) : null
  ) : (
    <WindowModal {...props} />
  );

Modal.defaultProps = {
  isOpen: true,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Modal;
