import React from "react";

import ModalContent from "metabase/components/ModalContent.jsx";

const nop = () => {};

const ConfirmContent = ({
    title,
    content,
    message = "Are you sure you want to do this?",
    onClose = nop,
    onAction = nop,
    onCancel = nop,
    confirmButtonText = "Yes",
    cancelButtonText = "Cancel"
}) =>
    <ModalContent
        title={title}
        onClose={() => { onCancel(); onClose(); }}
    >
        <div className="mx4">{content}</div>

        <div className="Form-inputs mb4">
            <p>{message}</p>
        </div>

        <div className="Form-actions ml-auto">
            <button className="Button" onClick={() => { onCancel(); onClose(); }}>{cancelButtonText}</button>
            <button className="Button Button--danger ml2" onClick={() => { onAction(); onClose(); }}>{confirmButtonText}</button>
        </div>
    </ModalContent>

export default ConfirmContent;
