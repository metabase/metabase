/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from 'c-3po';

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
                title={this.props.user.is_superuser ? t`To send pulses, you'll need to set up email or Slack integration.` : t`To send pulses, an admin needs to set up email or Slack integration.`}
            >
                <div className="ml-auto mb4 mr4">
                    <SetupMessage user={this.props.user} />
                </div>
            </ModalContent>
        );
    }
}
