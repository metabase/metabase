/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

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
                onClose={this.props.onClose}
                title={`To send pulses, ${ this.props.user.is_superuser ? "you'll need" : "an admin needs"} to set up email or Slack integration.`}
            >
                <SetupMessage user={this.props.user} />
            </ModalContent>
        );
    }
}
