import React from "react";
import { RoutelessFullPageModal } from "metabase/components/Modal/RoutelessFullPageModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";

const Modal = ({
  full = false,
  ...props
}: { full?: boolean; isOpen?: boolean } & { [_: string]: any }) =>
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
