/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import ModalContent from "metabase/components/ModalContent.jsx";
import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";

export default class ChannelSetupModal extends Component {
    static propTypes = {
        onClose: PropTypes.func.isRequired,
        user: PropTypes.object.isRequired,
        entityNamePlural: PropTypes.string.isRequired,
        channels: PropTypes.array,
        fullPageModal: PropTypes.boolean,
    };

    static defaultProps = {
        channels: ["email", "Slack"]
    }

    render() {
        const { onClose, user, entityNamePlural, fullPageModal, channels } = this.props


        return (
            <ModalContent
                onClose={onClose}
                fullPageModal={fullPageModal}
                title={`To send ${entityNamePlural}, ${ user.is_superuser ? "you'll need" : "an admin needs"} to set up ${channels.join(" or ")} integration.`}
            >
                <div className={cx("ml-auto mb4", { "mr4": !fullPageModal, "mr-auto text-centered": fullPageModal })}>
                    <ChannelSetupMessage user={this.props.user} />
                </div>
            </ModalContent>
        );
    }
}

