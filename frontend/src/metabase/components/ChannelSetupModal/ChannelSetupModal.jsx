/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import ModalContent from "metabase/components/ModalContent";
import CS from "metabase/css/core/index.css";

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
    const { onClose, user, entityNamePlural, fullPageModal, channels } =
      this.props;

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
          className={cx(CS.mlAuto, CS.mb4, {
            [CS.mr4]: !fullPageModal,
            [cx(CS.mrAuto, CS.textCentered)]: fullPageModal,
          })}
        >
          <ChannelSetupMessage user={this.props.user} />
        </div>
      </ModalContent>
    );
  }
}
