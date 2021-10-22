/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";

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
