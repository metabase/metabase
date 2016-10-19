import React, { Component, PropTypes } from "react";

import ModalContent from "metabase/components/ModalContent.jsx";

const ConfirmContent = ({ title, content, onClose, onAction, message = "Are you sure you want to do this?" }) =>
    <ModalContent
        title={title}
        closeFn={onClose}
    >
        <div className="mx4">{content}</div>

        <div className="Form-inputs mb4">
            <p>{message}</p>
        </div>

        <div className="Form-actions">
            <button className="Button Button--danger" onClick={() => { onAction(); onClose(); }}>Yes</button>
            <button className="Button ml1" onClick={onClose}>No</button>
        </div>
    </ModalContent>

export default ConfirmContent;
