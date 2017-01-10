import React, { Component, PropTypes } from "react";

import Modal from "metabase/components/Modal.jsx";

const Alert = ({ message, onClose }) =>
    <Modal small isOpen={!!message}>
        <div className="flex flex-column layout-centered p4">
            <h3 className="mb4">{message}</h3>
            <button className="Button Button--primary" onClick={onClose}>Ok</button>
        </div>
    </Modal>

export default Alert;
