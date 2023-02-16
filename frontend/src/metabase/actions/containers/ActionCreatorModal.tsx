import React from "react";
import Modal from "metabase/components/Modal";
import ActionCreator, { ActionCreatorProps } from "./ActionCreator";

function ActionCreatorModal({ onClose, ...props }: ActionCreatorProps) {
  return (
    <Modal wide onClose={onClose}>
      <ActionCreator {...props} onClose={onClose} />
    </Modal>
  );
}

export default ActionCreatorModal;
