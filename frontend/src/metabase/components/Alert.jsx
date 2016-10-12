import React, { Component, PropTypes } from "react";

import Modal from "metabase/components/Modal.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

const Alert = ({ message, onClose }) =>
    <Modal isOpen={!!message}>
        <ModalContent
            title={message}
            closeFn={onClose}
        >
            <div className="Form-actions">
                <button className="Button Button--primary" onClick={onClose}>Ok</button>
            </div>
        </ModalContent>
    </Modal>

export default Alert;
