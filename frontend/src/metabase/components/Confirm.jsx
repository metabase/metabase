/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

export default class Confirm extends Component {
    static propTypes = {
        action: PropTypes.func.isRequired,
        title: PropTypes.string.isRequired,
        children: PropTypes.any,
    };

    render() {
        const { action, children, title } = this.props;

        const onClose = () => {
            this.refs.modal.close();
        }

        const onAction = () => {
            onClose();
            action();
        }

        return (
            <ModalWithTrigger ref="modal" triggerElement={children}>
                <ModalContent
                    title={title}
                    closeFn={onClose}
                >
                    <div className="Form-inputs mb4">
                        <p>Are you sure you want to do this?</p>
                    </div>

                    <div className="Form-actions">
                        <button className="Button Button--danger" onClick={onAction}>Yes</button>
                        <button className="Button Button--primary ml1" onClick={onClose}>No</button>
                    </div>
                </ModalContent>
            </ModalWithTrigger>
        );
    }
}
