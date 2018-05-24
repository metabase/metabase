import React from "react";
import { t } from "c-3po";
import Modal from "metabase/components/Modal.jsx";

const Alert = ({ message, onClose }) => (
  <Modal small isOpen={!!message}>
    <div className="flex flex-column layout-centered p4">
      <h3 className="mb4">{message}</h3>
      <button
        className="Button Button--primary"
        onClick={onClose}
      >{t`Ok`}</button>
    </div>
  </Modal>
);

export default Alert;
