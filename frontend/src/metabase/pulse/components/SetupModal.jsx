/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import SetupMessage from "./SetupMessage.jsx";

import ModalContent from "metabase/components/ModalContent.jsx";

export default class SetupModal extends Component {
    static propTypes = {
        onClose: PropTypes.func.isRequired,
        user: PropTypes.object.isRequired
    };

    render() {
        return (
            <ModalContent
                closeFn={this.props.onClose}
            >
                <div className="mx4 px4 pb4 text-centered">
                    <h2>To send pulses, an admin needs to set up email or Slack integration.</h2>
                    <SetupMessage user={this.props.user} />
                </div>
            </ModalContent>
        );
    }
}
