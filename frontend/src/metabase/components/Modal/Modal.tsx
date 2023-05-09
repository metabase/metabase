/* eslint-disable react/prop-types */
import React from "react";
import { RoutelessFullPageModal } from "metabase/components/Modal/RoutelessFullPageModal";
import { WindowModal } from "metabase/components/Modal/WindowModal";

const Modal = ({ full = false, ...props }) =>
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

export default Modal;
