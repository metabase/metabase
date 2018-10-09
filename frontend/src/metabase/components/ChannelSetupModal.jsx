/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "c-3po";
import ModalContent from "metabase/components/ModalContent.jsx";
import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";

export default class ChannelSetupModal extends Component {
  static propTypes = {
    onClose: PropTypes.func.isRequired,
    user: PropTypes.object.isRequired,
    entityNamePlural: PropTypes.string.isRequired,
    channels: PropTypes.array,
    fullPageModal: PropTypes.bool,
  };

  static defaultProps = {
    channels: ["email", "Slack"],
  };

  render() {
    const {
      onClose,
      user,
      entityNamePlural,
      fullPageModal,
      channels,
    } = this.props;

    return (
      <ModalContent
        onClose={onClose}
        fullPageModal={fullPageModal}
        title={
          user.is_superuser
            ? t`To send ${entityNamePlural}, you'll need to set up ${channels.join(
                t` or `,
              )} integration.`
            : t`To send ${entityNamePlural}, an admin needs to set up ${channels.join(
                t` or `,
              )} integration.`
        }
      >
        <div
          className={cx("ml-auto mb4", {
            mr4: !fullPageModal,
            "mr-auto text-centered": fullPageModal,
          })}
        >
          <ChannelSetupMessage user={this.props.user} />
        </div>
      </ModalContent>
    );
  }
}
