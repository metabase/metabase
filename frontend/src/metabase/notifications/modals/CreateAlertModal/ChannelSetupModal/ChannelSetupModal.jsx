/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import ModalContent from "metabase/components/ModalContent";
import { Flex } from "metabase/ui";

const formatChannelString = channels => {
  const lastChannel = channels[channels.length - 1];
  const restChannels = channels.slice(0, -1);

  return restChannels.length > 0
    ? `${restChannels.join(", ")} ${t` or `} ${lastChannel}`
    : lastChannel;
};

export default class ChannelSetupModal extends Component {
  static propTypes = {
    onClose: PropTypes.func.isRequired,
    user: PropTypes.object.isRequired,
    entityNamePlural: PropTypes.string.isRequired,
    channels: PropTypes.array,
  };

  static defaultProps = {
    channels: ["email", "Slack"],
  };

  render() {
    const { onClose, user, entityNamePlural, channels } = this.props;

    return (
      <ModalContent
        onClose={onClose}
        title={
          user.is_superuser
            ? t`To send ${entityNamePlural}, you'll need to set up ${formatChannelString(channels)} integration.`
            : t`To send ${entityNamePlural}, an admin needs to set up ${formatChannelString(channels)} integration.`
        }
      >
        <Flex justify="center">
          <ChannelSetupMessage user={this.props.user} />
        </Flex>
      </ModalContent>
    );
  }
}
